"use client";

import { useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { DateTime } from "luxon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Upload, FileText, AlertCircle, CheckCircle2, Clock, Loader2, Database, Trash2, Info } from "lucide-react";
import { useGetSiteImports, useImportSiteData, useDeleteSiteImport } from "@/api/admin/import";
import { SplitDateRangePicker } from "@/components/SplitDateRangePicker";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { IS_CLOUD } from "@/lib/const";

interface ImportManagerProps {
  siteId: number;
  disabled: boolean;
}

const MAX_FILE_SIZE = IS_CLOUD ? 500 * 1024 * 1024 : 50 * 1024 * 1024 * 1024; // 500 MB for cloud, 50 GB for self-hosted
const CONFIRM_THRESHOLD = IS_CLOUD ? 100 * 1024 * 1024 : 1024 * 1024 * 1024; // Show confirmation for files > 100 MB (cloud) or > 1 GB (self-hosted)
const ALLOWED_FILE_TYPES = ["text/csv"];
const ALLOWED_EXTENSIONS = [".csv"];
const PLATFORMS = [{ value: "umami", label: "Umami" }] as const;

const importFormSchema = z.object({
  platform: z.enum(["umami"], { required_error: "Please select a platform" }),
  file: z
    .custom<FileList>()
    .refine(files => files.length === 1, "Please select a file")
    .refine(
      files => {
        const file = files[0];
        return file && file.size <= MAX_FILE_SIZE;
      },
      `File size must be less than ${MAX_FILE_SIZE / 1024 / 1024} MB`
    )
    .refine(files => {
      const file = files[0];
      if (!file) return false;
      const extension = "." + file.name.split(".").pop()?.toLowerCase();
      return ALLOWED_EXTENSIONS.includes(extension) || ALLOWED_FILE_TYPES.includes(file.type);
    }, "Only CSV files are accepted")
    .refine(files => {
      const file = files[0];
      return file && file.name.length <= 255;
    }, "Filename is too long"),
  dateRange: z
    .object({
      startDate: z.custom<DateTime>().optional(),
      endDate: z.custom<DateTime>().optional(),
    })
    .refine(
      data => {
        if (!data.startDate || !data.endDate) return true;
        return data.startDate <= data.endDate;
      },
      { message: "Start date must be before or equal to end date" }
    )
    .refine(
      data => {
        if (!data.startDate) return true;
        const today = DateTime.utc().startOf("day");
        return data.startDate <= today;
      },
      { message: "Start date cannot be in the future" }
    )
    .refine(
      data => {
        if (!data.endDate) return true;
        const today = DateTime.utc().startOf("day");
        return data.endDate <= today;
      },
      { message: "End date cannot be in the future" }
    ),
});

type ImportFormData = z.infer<typeof importFormSchema>;

function formatFileSize(bytes: number): string {
  const sizeInMB = bytes / 1024 / 1024;
  const sizeInGB = bytes / 1024 / 1024 / 1024;

  if (sizeInGB < 1) {
    return `${sizeInMB.toFixed(2)} MB`;
  } else {
    return `${sizeInGB.toFixed(2)} GB`;
  }
}

export function ImportManager({ siteId, disabled }: ImportManagerProps) {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [deleteImportId, setDeleteImportId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const { data, isLoading, error } = useGetSiteImports(siteId);
  const mutation = useImportSiteData(siteId);
  const deleteMutation = useDeleteSiteImport(siteId);

  const {
    control,
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isValid },
  } = useForm<ImportFormData>({
    resolver: zodResolver(importFormSchema),
    mode: "onChange",
    defaultValues: {
      platform: "" as "umami",
      file: Object.assign(new DataTransfer().files, {}),
      dateRange: {},
    },
  });

  const fileList = watch("file");
  const selectedFile = fileList?.[0];

  const onSubmit = (data: ImportFormData) => {
    const file = data.file[0];
    if (!file) return;

    if (file.size > CONFIRM_THRESHOLD) {
      setShowConfirmDialog(true);
    } else {
      executeImport(data);
    }
  };

  const executeImport = (data: ImportFormData) => {
    const file = data.file[0];
    if (!file) return;

    const startDate = data.dateRange.startDate?.toFormat("yyyy-MM-dd");
    const endDate = data.dateRange.endDate?.toFormat("yyyy-MM-dd");

    mutation.mutate(
      {
        file,
        platform: data.platform,
        startDate,
        endDate,
      },
      {
        onSuccess: () => {
          reset();
        },
      }
    );

    setShowConfirmDialog(false);
  };

  const handleDeleteClick = (importId: string) => {
    setDeleteImportId(importId);
    setShowDeleteDialog(true);
  };

  const handleDeleteConfirm = () => {
    if (deleteImportId) {
      deleteMutation.mutate(deleteImportId, {
        onSuccess: () => {
          setDeleteImportId(null);
          setShowDeleteDialog(false);
        },
        onError: () => {
          setDeleteImportId(null);
          setShowDeleteDialog(false);
        },
      });
    }
  };

  const getStatusInfo = (status: string) => {
    switch (status.toLowerCase()) {
      case "completed":
        return {
          color: "bg-green-100 text-green-800 border-green-200",
          icon: CheckCircle2,
          label: "Completed",
        };
      case "failed":
        return {
          color: "bg-red-100 text-red-800 border-red-200",
          icon: AlertCircle,
          label: "Failed",
        };
      case "processing":
        return {
          color: "bg-blue-100 text-blue-800 border-blue-200",
          icon: Loader2,
          label: "Processing",
        };
      case "pending":
        return {
          color: "bg-yellow-100 text-yellow-800 border-yellow-200",
          icon: Clock,
          label: "Pending",
        };
      default:
        return {
          color: "bg-gray-100 text-gray-800 border-gray-200",
          icon: Clock,
          label: status,
        };
    }
  };

  const sortedImports = useMemo(() => {
    if (!data?.data) {
      return [];
    }

    return [...data.data].sort((a, b) => {
      const aTime = new Date(a.startedAt).getTime();
      const bTime = new Date(b.startedAt).getTime();
      return bTime - aTime;
    });
  }, [data?.data]);

  const formData = watch();

  // Check if there's an active import (cloud only)
  const hasActiveImport =
    IS_CLOUD && sortedImports.some(imp => imp.status === "pending" || imp.status === "processing");

  const isImportDisabled = !isValid || mutation.isPending || disabled || hasActiveImport;

  return (
    <div className="space-y-6">
      {/* Import Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Data
          </CardTitle>
          <CardDescription>
            Import data from other analytics platforms. Supports CSV files up to {formatFileSize(MAX_FILE_SIZE)}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Active Import Warning */}
          {hasActiveImport && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                You have an active import in progress. Please wait for it to complete before starting a new import.
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Platform Selection */}
            <div className="space-y-2">
              <Label htmlFor="platform" className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                Platform
              </Label>
              <Controller
                name="platform"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={disabled || mutation.isPending || hasActiveImport}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select platform" />
                    </SelectTrigger>
                    <SelectContent>
                      {PLATFORMS.map(platform => (
                        <SelectItem key={platform.value} value={platform.value}>
                          {platform.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.platform && <p className="text-sm text-red-600">{errors.platform.message}</p>}
            </div>

            {/* Date Range Picker */}
            <Controller
              name="dateRange"
              control={control}
              render={({ field }) => (
                <div className="space-y-2">
                  <SplitDateRangePicker
                    value={field.value}
                    onChange={field.onChange}
                    label="Date Range (Optional)"
                    disabled={disabled || mutation.isPending || hasActiveImport}
                    showDescription={true}
                    clearButtonText="Clear dates"
                    className="space-y-2"
                  />
                  {errors.dateRange?.message && <p className="text-sm text-red-600">{errors.dateRange.message}</p>}
                </div>
              )}
            />

            <Separator />

            {/* File Upload */}
            <div className="space-y-2">
              <Label htmlFor="file" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                CSV File
              </Label>
              <Input
                type="file"
                accept=".csv"
                multiple={false}
                {...register("file")}
                disabled={disabled || mutation.isPending || hasActiveImport}
              />
              {selectedFile && (
                <p className="text-sm text-muted-foreground">
                  Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
                </p>
              )}
              {errors.file && <p className="text-sm text-red-600">{errors.file.message as string}</p>}
            </div>

            {/* Import Button */}
            <Button type="submit" disabled={isImportDisabled} className="w-full sm:w-auto">
              {mutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Import
                </>
              )}
            </Button>
          </form>

          {/* Import Error */}
          {mutation.isError && (
            <Alert variant="destructive">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {mutation.error.message || "Failed to import file. Please try again."}
                </AlertDescription>
              </div>
            </Alert>
          )}

          {/* Success Message */}
          {mutation.isSuccess && (
            <Alert className="border-green-200 bg-green-50">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription>File uploaded successfully and is being processed.</AlertDescription>
              </div>
            </Alert>
          )}

          {/* Delete Success Message */}
          {deleteMutation.isSuccess && (
            <Alert className="border-green-200 bg-green-50">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription>Import deleted successfully.</AlertDescription>
              </div>
            </Alert>
          )}

          {/* Delete Error Message */}
          {deleteMutation.isError && (
            <Alert variant="destructive">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {deleteMutation.error.message || "Failed to delete import. Please try again."}
                </AlertDescription>
              </div>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Import History */}
      <Card>
        <CardHeader>
          <CardTitle>Import History</CardTitle>
          <CardDescription>Track the status of your data imports</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && !data ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span>Loading import history...</span>
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>Failed to load import history. Please try refreshing the page.</AlertDescription>
            </Alert>
          ) : !data?.data?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No imports yet</p>
              <p className="text-sm">Upload a CSV file to get started</p>
            </div>
          ) : (
            <div className="rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Events</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedImports.map(imp => {
                    const statusInfo = getStatusInfo(imp.status);
                    const StatusIcon = statusInfo.icon;

                    return (
                      <TableRow key={imp.importId}>
                        <TableCell className="font-medium">
                          <div className="max-w-[200px] truncate" title={imp.fileName}>
                            {imp.fileName}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {imp.platform}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge className={`${statusInfo.color} flex items-center gap-1`}>
                              <StatusIcon className={`h-3 w-3 ${imp.status === "processing" ? "animate-spin" : ""}`} />
                              {statusInfo.label}
                            </Badge>
                            {imp.errorMessage && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="text-red-600 hover:text-red-700">
                                      <Info className="h-4 w-4" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="right" className="max-w-sm">
                                    <p className="text-sm">{imp.errorMessage}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{imp.importedEvents.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          {(imp.status === "completed" || imp.status === "failed") && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteClick(imp.importId)}
                              disabled={disabled || deleteMutation.isPending}
                              className="h-8 w-8 p-0"
                            >
                              {deleteMutation.isPending && deleteMutation.variables === imp.importId ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Large File Import</AlertDialogTitle>
            <AlertDialogDescription>
              You're about to import a large file ({selectedFile ? formatFileSize(selectedFile.size) : "?"}). This may
              take several minutes to process.
              {!IS_CLOUD && selectedFile && (
                <>
                  {" "}
                  Ensure your server has at least {Math.ceil((selectedFile.size / 1024 / 1024 / 1024) * 2)} GB of free
                  disk space.
                </>
              )}{" "}
              Are you sure you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => executeImport(formData)}>Yes, Import File</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Import</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this import? This action cannot be undone. The import data and associated
              files will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-red-600 hover:bg-red-700">
              Delete Import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
