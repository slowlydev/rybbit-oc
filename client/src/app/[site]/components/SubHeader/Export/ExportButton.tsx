"use client";

import { Download, FileArchive, FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "../../../../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../../../components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../../../../components/ui/tooltip";
import { getTimezone, useStore } from "../../../../../lib/store";
import { exportCsv } from "./exportCsv";
import { exportPdf } from "./exportPdf";

export function ExportButton() {
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const { site, time, filters } = useStore();

  const handleExportPdf = async () => {
    if (!site) {
      toast.error("No site selected");
      return;
    }

    setIsExportingPdf(true);

    try {
      await exportPdf({ site, time, filters, timeZone: getTimezone() });
      toast.success("PDF report downloaded");
    } catch (error) {
      console.error("PDF export failed:", error);
      toast.error(error instanceof Error ? error.message : "Failed to generate PDF report");
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportCsv = async () => {
    if (!site) {
      toast.error("No site selected");
      return;
    }

    setIsExportingCsv(true);

    try {
      const fileCount = await exportCsv({ site, time, filters, timeZone: getTimezone() });
      toast.success(`Exported ${fileCount} files`);
    } catch (error) {
      console.error("Export failed:", error);
      toast.error(error instanceof Error ? error.message : "Export failed. Please try again.");
    } finally {
      setIsExportingCsv(false);
    }
  };

  const isExporting = isExportingCsv || isExportingPdf;

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="icon" disabled={isExporting} className="h-8 w-8">
              {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>Export data</p>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        {/* <DropdownMenuItem onClick={handleExportPdf} disabled={isExportingPdf}>
          <FileText className="h-4 w-4 mr-2" />
          {isExportingPdf ? "Generating PDF..." : "Export as PDF Report"}
        </DropdownMenuItem> */}
        <DropdownMenuItem onClick={handleExportCsv} disabled={isExportingCsv}>
          <FileArchive className="h-4 w-4 mr-2" />
          {isExportingCsv ? "Exporting..." : "Export as CSV (ZIP)"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
