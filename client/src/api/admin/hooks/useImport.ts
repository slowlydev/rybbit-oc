import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImportPlatform } from "@/types/import";
import { getSiteImports, createSiteImport, deleteSiteImport } from "../endpoints";

export function useGetSiteImports(site: number) {
  return useQuery({
    queryKey: ["get-site-imports", site],
    queryFn: async () => await getSiteImports(site),
    refetchInterval: data => {
      const hasActiveImports = data.state.data?.data.some(imp => imp.completedAt === null);
      return hasActiveImports ? 5000 : false;
    },
    placeholderData: { data: [] },
    staleTime: 30000,
  });
}

export function useCreateSiteImport(site: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { platform: ImportPlatform }) => {
      return await createSiteImport(site, data);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["get-site-imports", site],
      });
    },
    retry: false,
  });
}

export function useDeleteSiteImport(site: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (importId: string) => {
      return await deleteSiteImport(site, importId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["get-site-imports", site],
      });
    },
    retry: false,
  });
}
