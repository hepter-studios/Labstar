use axum::{Json, extract::State};
use serde::Deserialize;

use crate::{
    auth::AuthenticatedMember,
    error::ApiError,
    members::MemberView,
    state::AppState,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMemberInput {
    pub email: String,
    pub name: String,
    pub role: String,
    #[serde(default)]
    pub job_title: String,
    #[serde(default)]
    pub area: String,
}

pub async fn create(
    State(state): State<AppState>,
    actor: AuthenticatedMember,
    Json(input): Json<CreateMemberInput>,
) -> Result<Json<MemberView>, ApiError> {
    actor.require_admin()?;
    if input.role == "owner" || (input.role == "admin" && actor.role != "owner") {
        return Err(ApiError::PermissionDenied);
    }
    if !matches!(input.role.as_str(), "admin" | "manager" | "member" | "viewer") {
        return Err(ApiError::invalid("role"));
    }
    let email = normalize_email(&input.email)?;
    let name = clean(&input.name, 120);
    let name = if name.is_empty() {
        email.split('@').next().unwrap_or("Membro").to_string()
    } else {
        name
    };

    let mut member = sqlx::query_as::<_, MemberView>(
        r#"
        insert into public.members
          (email,name,status,role,job_title,area,assignments,last_seen_at)
        values ($1,$2,'active',$3,$4,$5,array[]::text[],now())
        on conflict (email) do update set
          name=excluded.name,job_title=excluded.job_title,area=excluded.area,
          role=case when public.members.role::text='owner' then public.members.role else excluded.role end,
          updated_at=now()
        returning id,email,name,status::text status,role::text role,
                  coalesce(job_title,'') job_title,coalesce(area,'') area,
                  coalesce(assignments,array[]::text[]) assignments,
                  created_at,last_seen_at,coalesce(avatar_path,'') avatar_path
        "#,
    )
    .bind(email)
    .bind(name)
    .bind(input.role)
    .bind(clean(&input.job_title, 120))
    .bind(clean(&input.area, 120))
    .fetch_one(&state.pool)
    .await?;
    member.avatar_url = String::new();
    Ok(Json(member))
}

fn normalize_email(value: &str) -> Result<String, ApiError> {
    let email = value.trim().to_ascii_lowercase();
    let Some((local, domain)) = email.split_once('@') else {
        return Err(ApiError::invalid("email"));
    };
    if local.is_empty() || domain.is_empty() || !domain.contains('.') || email.len() > 320 {
        return Err(ApiError::invalid("email"));
    }
    Ok(email)
}

fn clean(value: &str, limit: usize) -> String {
    value.trim().chars().take(limit).collect()
}
