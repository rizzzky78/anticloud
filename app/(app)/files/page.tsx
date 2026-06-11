import { Fragment } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-context";
import { listFilesGrouped, listSubfolders, listUserFolderPaths } from "@/lib/file-list";
import { FileList } from "@/components/file-list";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

interface PageProps {
  searchParams: Promise<{
    folderPath?: string;
    page?: string;
    pageSize?: string;
  }>;
}

export default async function FilesPage({ searchParams }: PageProps) {
  const session = await getCurrentUser();
  if (!session) {
    redirect("/sign-in");
  }

  const { folderPath = "/", page = "1", pageSize = "50" } = await searchParams;

  const currentPage = Math.max(1, parseInt(page, 10));
  const limit = Math.min(200, Math.max(1, parseInt(pageSize, 10)));
  const offset = (currentPage - 1) * limit;

  const user = { id: session.user.id, role: session.user.role as string };

  // Fetch data concurrently
  const [buckets, subfolders, folderPaths] = await Promise.all([
    listFilesGrouped(user, { folderPath, pageSize: limit, offset }),
    listSubfolders(user, folderPath),
    listUserFolderPaths(user),
  ]);

  // Build breadcrumbs
  const segments = folderPath.split("/").filter(Boolean);
  const breadcrumbs = [{ label: "Files", path: "/" }];
  let runningPath = "";
  for (const segment of segments) {
    runningPath += "/" + segment;
    breadcrumbs.push({ label: segment, path: runningPath });
  }

  const totalFetched = buckets.reduce((acc, b) => acc + b.files.length, 0);
  const hasNextPage = totalFetched === limit;

  const getPaginationUrl = (pageNumber: number) => {
    return `/files?folderPath=${encodeURIComponent(folderPath)}&page=${pageNumber}&pageSize=${limit}`;
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Page Header with Breadcrumbs */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <Breadcrumb>
            <BreadcrumbList>
              {breadcrumbs.map((bc, idx) => {
                const isLast = idx === breadcrumbs.length - 1;
                return (
                  <Fragment key={bc.path}>
                    <BreadcrumbItem>
                      {isLast ? (
                        <BreadcrumbPage>{bc.label}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink asChild>
                          <Link href={`/files?folderPath=${encodeURIComponent(bc.path)}`}>
                            {bc.label}
                          </Link>
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                    {!isLast && <BreadcrumbSeparator />}
                  </Fragment>
                );
              })}
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </div>

      {/* File List Grid & Tables */}
      <div className="flex-1">
        <FileList
          buckets={buckets}
          subfolders={subfolders}
          folderPaths={folderPaths}
          userId={session.user.id}
          userRole={session.user.role as string}
          currentFolderPath={folderPath}
        />
      </div>

      {/* Pagination Footer */}
      {(currentPage > 1 || hasNextPage) && (
        <div className="flex justify-center pt-4 border-t">
          <Pagination>
            <PaginationContent>
              {currentPage > 1 && (
                <PaginationItem>
                  <PaginationPrevious href={getPaginationUrl(currentPage - 1)} />
                </PaginationItem>
              )}
              {hasNextPage && (
                <PaginationItem>
                  <PaginationNext href={getPaginationUrl(currentPage + 1)} />
                </PaginationItem>
              )}
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
}
