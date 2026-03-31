"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TableStats } from "@/api/admin/endpoints/clickhouseStats";
import { Database, HardDrive, Layers, Server } from "lucide-react";

interface TableStatsCardsProps {
  tableStats: TableStats[] | undefined;
  isLoading: boolean;
}

function formatNumber(num: number): string {
  if (num >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(2) + "B";
  }
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(2) + "M";
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(2) + "K";
  }
  return num.toLocaleString();
}

export function TableStatsCards({ tableStats, isLoading }: TableStatsCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-32 mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!tableStats || tableStats.length === 0) {
    return (
      <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
        No table statistics available
      </div>
    );
  }

  const totalRows = tableStats.reduce((sum, t) => sum + t.totalRows, 0);
  const totalCompressedBytes = tableStats.reduce((sum, t) => sum + t.compressedBytes, 0);
  const totalUncompressedBytes = tableStats.reduce((sum, t) => sum + t.uncompressedBytes, 0);
  const totalParts = tableStats.reduce((sum, t) => sum + t.partsCount, 0);

  const formatBytes = (bytes: number): string => {
    if (bytes >= 1024 * 1024 * 1024) {
      return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
    }
    if (bytes >= 1024 * 1024) {
      return (bytes / (1024 * 1024)).toFixed(2) + " MB";
    }
    if (bytes >= 1024) {
      return (bytes / 1024).toFixed(2) + " KB";
    }
    return bytes + " B";
  };

  const compressionRatio =
    totalUncompressedBytes > 0 ? ((1 - totalCompressedBytes / totalUncompressedBytes) * 100).toFixed(1) : "0";

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Rows</CardTitle>
          <Database className="h-4 w-4 text-neutral-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatNumber(totalRows)}</div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Across {tableStats.length} tables</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Compressed Size</CardTitle>
          <HardDrive className="h-4 w-4 text-neutral-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatBytes(totalCompressedBytes)}</div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{compressionRatio}% compression ratio</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Uncompressed Size</CardTitle>
          <Server className="h-4 w-4 text-neutral-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatBytes(totalUncompressedBytes)}</div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Original data size</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Parts</CardTitle>
          <Layers className="h-4 w-4 text-neutral-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatNumber(totalParts)}</div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Active data parts</p>
        </CardContent>
      </Card>
    </div>
  );
}
