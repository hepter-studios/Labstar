use axum::{extract::{Query, State}, Json};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use crate::{auth::AuthenticatedMember, error::ApiError, state::AppState};

#[derive(Debug, Deserialize)]
pub struct SearchQuery { pub q: String }

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub subtitle: String,
    pub target_id: String,
    pub score: i32,
}

#[derive(Debug, FromRow)]
struct Candidate {
    id: Uuid,
    kind: String,
    title: String,
    subtitle: String,
    target_id: Uuid,
}

pub async fn global_search(
    State(state): State<AppState>,
    member: AuthenticatedMember,
    Query(query): Query<SearchQuery>,
) -> Result<Json<Vec<SearchResult>>, ApiError> {
    let normalized = normalize(&query.q);
    if normalized.chars().count() < 2 || normalized.chars().count() > 100 {
        return Err(ApiError::invalid("q"));
    }
    let pattern = format!("%{}%", escape_like(&normalized));

    let mut candidates = sqlx::query_as::<_, Candidate>(r#"
        select id, 'member'::text kind, name title,
               concat_ws(' · ', nullif(job_title,''), nullif(area,''), email) subtitle,
               id target_id
        from public.members
        where status='active' and (lower(name) like $1 escape '\\' or lower(email) like $1 escape '\\')
        order by lower(name) limit 40
    "#).bind(&pattern).fetch_all(&state.pool).await?;

    let channels = sqlx::query_as::<_, Candidate>(r#"
        select channel.id, 'channel'::text kind, channel.name title,
               coalesce(channel.description,'') subtitle, channel.id target_id
        from public.channels channel
        where lower(channel.name) like $1 escape '\\' or lower(coalesce(channel.description,'')) like $1 escape '\\'
        order by channel.position limit 40
    "#).bind(&pattern).fetch_all(&state.pool).await.unwrap_or_default();
    candidates.extend(channels);

    let messages = sqlx::query_as::<_, Candidate>(r#"
        select message.id, 'direct_message'::text kind,
               left(message.body,120) title,
               author.name subtitle,
               message.thread_id target_id
        from public.direct_messages message
        join public.direct_thread_members membership on membership.thread_id=message.thread_id and membership.member_id=$2
        join public.members author on author.id=message.author_id
        where lower(message.body) like $1 escape '\\'
        order by message.created_at desc limit 60
    "#).bind(&pattern).bind(member.member_id).fetch_all(&state.pool).await?;
    candidates.extend(messages);

    let mut results = candidates.into_iter().map(|candidate| {
        let score = rank(&normalized, &candidate.title, &candidate.subtitle);
        SearchResult {
            id: format!("{}:{}", candidate.kind, candidate.id),
            kind: candidate.kind,
            title: candidate.title,
            subtitle: candidate.subtitle,
            target_id: candidate.target_id.to_string(),
            score,
        }
    }).collect::<Vec<_>>();
    results.sort_by(|left,right| right.score.cmp(&left.score).then_with(|| left.title.cmp(&right.title)));
    results.truncate(60);
    Ok(Json(results))
}

fn normalize(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase()
}

fn escape_like(value: &str) -> String {
    value.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_")
}

fn rank(query: &str, title: &str, subtitle: &str) -> i32 {
    let title = title.to_lowercase();
    let subtitle = subtitle.to_lowercase();
    let mut score = 0;
    if title == query { score += 1000; }
    if title.starts_with(query) { score += 600; }
    if title.contains(query) { score += 350; }
    if subtitle.contains(query) { score += 120; }
    for token in query.split_whitespace() {
        if title.split_whitespace().any(|word| word.starts_with(token)) { score += 80; }
        if subtitle.contains(token) { score += 25; }
    }
    score - i32::try_from(title.chars().count().min(120)).unwrap_or(120)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_and_prefix_matches_rank_first() {
        assert!(rank("mompy", "Mompy", "Projeto") > rank("mompy", "Projeto Mompy", ""));
        assert!(rank("lab", "Labstar", "") > rank("lab", "Equipe", "Laboratório"));
    }
}
