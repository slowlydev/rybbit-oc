"use client";

import { Settings } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
} from "@/components/ui/responsive-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useUserOrganizations } from "@/api/admin/hooks/useOrganizations";
import { SiteResponse } from "@/api/admin/endpoints";
import { useGetSite } from "@/api/admin/hooks/useSites";
import { ImportManager } from "./ImportManager";
import { ScriptBuilder } from "./ScriptBuilder";
import { SiteConfiguration } from "./SiteConfiguration";

export function SiteSettings({ siteId, trigger }: { siteId: number; trigger?: React.ReactNode }) {
  const { data: siteMetadata, isLoading, error } = useGetSite(siteId);

  if (isLoading || !siteMetadata || error) {
    return null;
  }

  return <SiteSettingsInner siteMetadata={siteMetadata} trigger={trigger} />;
}

function SiteSettingsInner({ siteMetadata, trigger }: { siteMetadata: SiteResponse; trigger?: React.ReactNode }) {
  const { data: userOrganizationsData } = useUserOrganizations();
  const disabled = !userOrganizationsData?.[0]?.role || userOrganizationsData?.[0]?.role === "member";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("settings");

  if (!siteMetadata) {
    return null;
  }

  return (
    <ResponsiveDialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <ResponsiveDialogTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="icon">
            <Settings className="h-4 w-4" />
          </Button>
        )}
      </ResponsiveDialogTrigger>
      <ResponsiveDialogContent className="sm:max-w-[750px] p-4 sm:p-6 space-y-2">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Site Settings</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>Manage settings for {siteMetadata.domain}</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="pb-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="settings">Site Settings</TabsTrigger>
            <TabsTrigger value="script">Tracking Script</TabsTrigger>
            <TabsTrigger value="import">Import</TabsTrigger>
          </TabsList>

          <TabsContent value="script" className="pt-4 space-y-4 max-h-[70vh] overflow-y-auto">
            <ScriptBuilder siteId={siteMetadata.id ?? String(siteMetadata.siteId)} />
          </TabsContent>

          <TabsContent value="import" className="pt-4 space-y-4 max-h-[70vh] overflow-y-auto">
            <ImportManager siteId={siteMetadata.siteId} disabled={disabled} />
          </TabsContent>

          <TabsContent value="settings">
            <SiteConfiguration siteMetadata={siteMetadata} disabled={disabled} onClose={() => setDialogOpen(false)} />
          </TabsContent>
        </Tabs>
        {/* 
        <ResponsiveDialogFooter className="pb-4">
          <ResponsiveDialogClose asChild>
            <Button variant="outline">Close</Button>
          </ResponsiveDialogClose>
        </ResponsiveDialogFooter> */}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
