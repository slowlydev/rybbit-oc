import { authedFetch } from "../../utils";

export type GetOrganizationMembersResponse = {
  data: {
    id: string;
    role: string;
    userId: string;
    organizationId: string;
    createdAt: string;
    user: {
      id: string;
      name: string | null;
      email: string;
    };
  }[];
};

export function getOrganizationMembers(organizationId: string) {
  return authedFetch<GetOrganizationMembersResponse>(`/organizations/${organizationId}/members`);
}
