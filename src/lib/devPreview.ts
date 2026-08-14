import { MEMBER_PROFILE_UPDATED_EVENT, type ChannelCategory, type CollaborationSpace, type LabstarChannel, type Member } from "./supabase";

const DEV_PREVIEW_PROFILE_KEY = "labstar-dev-preview-profile-v1";

type DevPreviewProfile = {
  name?: string;
  bio?: string;
};

export function loadDevPreviewProfile(member: Member): Member {
  try {
    const stored = JSON.parse(window.localStorage.getItem(DEV_PREVIEW_PROFILE_KEY) ?? "{}") as DevPreviewProfile;
    const name = typeof stored.name === "string" ? stored.name.trim().slice(0, 100) : "";
    const bio = typeof stored.bio === "string" ? stored.bio.trim().slice(0, 300) : member.bio;
    return { ...member, name: name || member.name, bio };
  } catch {
    return member;
  }
}

export function saveDevPreviewProfile(member: Member, name: string, bio?: string): Member {
  const cleanName = name.trim().slice(0, 100);
  if (cleanName.length < 2) throw new Error("invalid_profile_name");
  const updated = {
    ...member,
    name: cleanName,
    bio: bio === undefined ? member.bio : bio.trim().slice(0, 300),
  };
  window.localStorage.setItem(DEV_PREVIEW_PROFILE_KEY, JSON.stringify({
    name: updated.name,
    bio: updated.bio ?? "",
  } satisfies DevPreviewProfile));
  window.dispatchEvent(new CustomEvent<Member>(MEMBER_PROFILE_UPDATED_EVENT, { detail: updated }));
  return updated;
}

export function devPreviewCurrentMember(): Member {
  const timestamp = new Date().toISOString();
  return loadDevPreviewProfile({
    id: "preview-member",
    email: "preview@labstar.local",
    name: "Mackson Victor",
    status: "active",
    role: "owner",
    jobTitle: "CEO",
    area: "Direção",
    assignments: ["labstar"],
    createdAt: timestamp,
    lastSeenAt: timestamp,
    avatarPath: "",
    avatarUrl: "",
    jobRoles: [{
      id: "preview-role",
      name: "CEO",
      department: "Diretoria",
      color: "#ef5b62",
      icon: "star",
      position: 10,
      permissions: ["manage_members", "manage_channels", "manage_projects"],
    }],
  });
}

export function devPreviewCollaboration() {
  const spaces: CollaborationSpace[] = [
    {
      id: "preview-space-labstar",
      name: "Labstar",
      description: "Ecossistema central de empresas, produtos e projetos.",
      kind: "company",
      color: "#8baeff",
      icon: "★",
      logoPath: "",
      logoUrl: "",
      position: 10,
    },
    {
      id: "preview-space-aurora",
      name: "Projeto Aurora",
      description: "Primeiro universo original do estúdio.",
      kind: "project",
      color: "#9b7bff",
      icon: "A",
      logoPath: "",
      logoUrl: "",
      position: 20,
    },
  ];
  const categories: ChannelCategory[] = [
    { id: "preview-category-team", spaceId: "preview-space-labstar", name: "EQUIPE", position: 10 },
    { id: "preview-category-project", spaceId: "preview-space-aurora", name: "PROJETO", position: 10 },
  ];
  const channels: LabstarChannel[] = [
    {
      id: "preview-channel-general",
      spaceId: "preview-space-labstar",
      categoryId: "preview-category-team",
      name: "geral",
      description: "Decisões e alinhamentos da equipe.",
      type: "text",
      allowedRoles: [],
      allowedAssignments: [],
      position: 10,
    },
    {
      id: "preview-channel-science",
      spaceId: "preview-space-labstar",
      categoryId: "preview-category-team",
      name: "pesquisa-e-ciência",
      description: "Pesquisa, evidências e direção científica.",
      type: "text",
      allowedRoles: ["owner", "admin"],
      allowedAssignments: [],
      position: 20,
    },
    {
      id: "preview-channel-aurora",
      spaceId: "preview-space-aurora",
      categoryId: "preview-category-project",
      name: "produção",
      description: "Acompanhamento do Projeto Aurora.",
      type: "text",
      allowedRoles: [],
      allowedAssignments: ["Projeto Aurora"],
      position: 10,
    },
  ];
  return { spaces, categories, channels };
}

export function devPreviewMembers(current: Member): Member[] {
  const timestamp = new Date().toISOString();
  return [
    current,
    {
      id: "preview-member-cso",
      email: "cientifica@labstar.local",
      name: "Dra. Helena Costa",
      status: "active",
      role: "admin",
      jobTitle: "Chief Scientific Officer",
      area: "Diretoria Científica",
      assignments: ["Labstar", "Projeto Aurora"],
      createdAt: timestamp,
      lastSeenAt: timestamp,
      avatarPath: "",
      avatarUrl: "",
      jobRoles: [{
        id: "preview-role-cso",
        name: "CSO",
        department: "Diretoria Científica",
        color: "#8B1E3F",
        icon: "star",
        position: 16,
        permissions: ["manage_projects"],
      }],
    },
    {
      id: "preview-member-product",
      email: "produto@labstar.local",
      name: "Rafael Lima",
      status: "active",
      role: "member",
      jobTitle: "Product Designer",
      area: "Produto",
      assignments: ["Projeto Aurora"],
      createdAt: timestamp,
      lastSeenAt: timestamp,
      avatarPath: "",
      avatarUrl: "",
      jobRoles: [{
        id: "preview-role-product",
        name: "Produto",
        department: "Produto",
        color: "#6F95E8",
        icon: "star",
        position: 50,
        permissions: [],
      }],
    },
  ];
}
