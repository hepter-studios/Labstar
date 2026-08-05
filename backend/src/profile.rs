use axum::{extract::State, Json};
use serde::Deserialize;

use crate::{
    auth::AuthenticatedMember,
    error::ApiError,
    members::{MemberRow, MemberView},
    state::AppState,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProfileInput {
    pub name: Option<String>,
    pub avatar_path: Option<String>,
    #[serde(default)]
    pub clear_avatar: bool,
}

pub async fn update(
    State(state): State<AppState>,
    member: AuthenticatedMember,
    Json(input): Json<UpdateProfileInput>,
) -> Result<Json<MemberView>, ApiError> {
    let name = input
        .name
        .map(|value| value.trim().chars().take(120).collect::<String>());
    if name.as_ref().is_some_and(String::is_empty) {
        return Err(ApiError::invalid("name"));
    }
    let avatar_path = if input.clear_avatar {
        Some(String::new())
    } else {
        input
            .avatar_path
            .map(|value| value.trim().chars().take(500).collect())
    };

    let row = sqlx::query_as::<_, MemberRow>(
        r#"
        update public.members
        set name=coalesce($2,name),
            avatar_path=case when $3::text is null then avatar_path else nullif($3,'') end,
            updated_at=now(),last_seen_at=now()
        where id=$1
        returning id,email,name,status::text as status,role::text as role,
                  coalesce(job_title,'') as job_title,
                  coalesce(area,'') as area,
                  coalesce(assignments,'[]'::jsonb)::text as assignments_json,
                  created_at,last_seen_at,coalesce(avatar_path,'') as avatar_path
        "#,
    )
    .bind(member.member_id)
    .bind(name)
    .bind(avatar_path)
    .fetch_one(&state.pool)
    .await?;

    let mut member = row.into_view();
    member.avatar_url = crate::files::signed_asset_url(&state, &member.avatar_path, 28_800)
        .await
        .unwrap_or_default();
    Ok(Json(member))
}
