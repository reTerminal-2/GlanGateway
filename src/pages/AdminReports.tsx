import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "react-query";
import { useQueryWithLoading } from "../hooks/useLoadingHooks";
import { axiosInstance } from "../api-client";
import { fetchReports, updateReport } from "../api-client";
import useAppContext from "../hooks/useAppContext";
import { useAdminBypass } from "../hooks/useAdminBypass";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  XCircle, 
  Search,
  User,
  Calendar,
  Flag,
  ShieldOff,
  ArrowLeft
} from "lucide-react";

interface Report {
  _id: string;
  reporterId: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  reportedItemId: string;
  reportedItemType: "hotel" | "booking" | "review" | "user";
  reason: string;
  description: string;
  status: "pending" | "under_review" | "resolved" | "dismissed";
  priority: "low" | "medium" | "high" | "urgent";
  adminNotes?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  resolvedBy?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

const AdminReports: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useAppContext();
  const { isAdmin } = useAdminBypass();
  const [filter, setFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [adminNotes, setAdminNotes] = useState<string>("");
  const queryClient = useQueryClient();

  React.useEffect(() => {
    if (selectedReport) {
      setAdminNotes(selectedReport.adminNotes || "");
    } else {
      setAdminNotes("");
    }
  }, [selectedReport]);

  const { data: reportsData, isLoading, error } = useQueryWithLoading(
    ["reports", filter],
    () => fetchReports(1, 50, filter !== "all" ? filter : undefined),
    {
      enabled: isAdmin,
      loadingMessage: "Loading reports...",
    }
  );

  const filteredReports = React.useMemo(() => {
    if (!reportsData?.data) return [];
    
    const reports = Array.isArray(reportsData.data) ? reportsData.data : [];
    
    if (!searchTerm) return reports;
    
    return reports.filter((report: Report) => {
      const description = report.description?.toLowerCase() || "";
      const email = report.reporterId?.email?.toLowerCase() || "";
      const reason = report.reason?.toLowerCase() || "";
      const searchLower = searchTerm.toLowerCase();
      
      return description.includes(searchLower) || email.includes(searchLower) || reason.includes(searchLower);
    });
  }, [reportsData, searchTerm]);

  const updateReportMutation = useMutation(
    ({ reportId, status, adminNotes }: { reportId: string; status: string; adminNotes?: string }) =>
      updateReport(reportId, { status, adminNotes }),
    {
      onSuccess: () => {
        showToast({
          title: "Report Updated",
          description: "The report status has been updated successfully.",
          type: "SUCCESS",
        });
        queryClient.invalidateQueries(["reports"]);
      },
      onError: (error: any) => {
        showToast({
          title: "Update Failed",
          description: error.response?.data?.message || "Failed to update report.",
          type: "ERROR",
        });
      }
    }
  );

  // Check if user has access
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <ShieldOff className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-red-600 mb-2">Access Denied</h2>
          <p className="text-gray-600">Only administrators can access the reports module.</p>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "under_review":
        return "bg-blue-100 text-blue-800";
      case "resolved":
        return "bg-green-100 text-green-800";
      case "dismissed":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "low":
        return "bg-gray-100 text-gray-800";
      case "medium":
        return "bg-yellow-100 text-yellow-800";
      case "high":
        return "bg-orange-100 text-orange-800";
      case "urgent":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <Clock className="w-4 h-4" />;
      case "under_review":
        return <AlertTriangle className="w-4 h-4" />;
      case "resolved":
        return <CheckCircle className="w-4 h-4" />;
      case "dismissed":
        return <XCircle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading reports...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-red-600 mb-2">Error Loading Reports</h2>
          <p className="text-gray-600">{error.message || "Failed to load reports. Please try again later."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <Button
            variant="ghost"
            onClick={() => navigate(-1)}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Exit
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Report Management</h1>
            <p className="text-gray-600">Review and manage user-submitted reports</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search reports..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="under_review">Under Review</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Reports List */}
      <div className="grid gap-4">
        {filteredReports.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border p-8 text-center">
            <Flag className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No reports found</h3>
            <p className="text-gray-600">
              {searchTerm ? "Try adjusting your search terms" : "No reports match the current filter"}
            </p>
          </div>
        ) : (
          filteredReports.map((report: Report) => (
            <div
              key={report._id}
              className="bg-white rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setSelectedReport(report)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <Badge className={getStatusColor(report.status)}>
                      <span className="flex items-center gap-1">
                        {getStatusIcon(report.status)}
                        {report.status.replace("_", " ")}
                      </span>
                    </Badge>
                    <Badge className={getPriorityColor(report.priority)}>
                      {report.priority}
                    </Badge>
                    <Badge variant="outline">
                      {report.reportedItemType}
                    </Badge>
                  </div>
                  
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Report: {report.reason.replace("_", " ")}
                  </h3>
                  
                  <p className="text-gray-600 mb-3 line-clamp-2">
                    {report.description}
                  </p>
                  
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <div className="flex items-center gap-1">
                      <User className="w-4 h-4" />
                      {report.reporterId?.firstName || 'Unknown'} {report.reporterId?.lastName || ''}
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {new Date(report.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                
                <div className="ml-4">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedReport(report);
                    }}
                    className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    View Details
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Report Detail Modal */}
      {selectedReport && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Report Details</h2>
                <button
                  onClick={() => setSelectedReport(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Report Info */}
              <div>
                <h3 className="font-medium text-gray-900 mb-3">Report Information</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Reporter:</span>
                    <p className="font-medium">
                      {selectedReport.reporterId?.firstName || 'Unknown'} {selectedReport.reporterId?.lastName || ''}
                    </p>
                    <p className="text-gray-600">{selectedReport.reporterId?.email || 'No email'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Date:</span>
                    <p className="font-medium">
                      {new Date(selectedReport.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Type:</span>
                    <p className="font-medium">{selectedReport.reportedItemType}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Item ID:</span>
                    <p className="font-medium text-xs">{selectedReport.reportedItemId}</p>
                  </div>
                </div>
              </div>

              {/* Reason and Description */}
              <div>
                <h3 className="font-medium text-gray-900 mb-3">Reason & Description</h3>
                <div className="space-y-3">
                  <div>
                    <span className="text-gray-500 text-sm">Reason:</span>
                    <p className="font-medium">{selectedReport.reason.replace("_", " ")}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-sm">Description:</span>
                    <p className="text-gray-700">{selectedReport.description}</p>
                  </div>
                </div>
              </div>

              {/* Admin Actions */}
              <div>
                <h3 className="font-medium text-gray-900 mb-3">Admin Actions</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Admin Notes
                    </label>
                    <textarea
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      rows={3}
                      placeholder="Add notes about this report..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  
                  <div className="flex gap-3">
                    {selectedReport.status !== "resolved" && (
                      <button
                        onClick={() => updateReportMutation.mutate({
                          reportId: selectedReport._id,
                          status: "resolved",
                          adminNotes
                        })}
                        disabled={updateReportMutation.isLoading}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300"
                      >
                        Mark as Resolved
                      </button>
                    )}
                    
                    {selectedReport.status !== "dismissed" && (
                      <button
                        onClick={() => updateReportMutation.mutate({
                          reportId: selectedReport._id,
                          status: "dismissed",
                          adminNotes
                        })}
                        disabled={updateReportMutation.isLoading}
                        className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:bg-gray-300"
                      >
                        Dismiss Report
                      </button>
                    )}
                    
                    {selectedReport.status === "pending" && (
                      <button
                        onClick={() => updateReportMutation.mutate({
                          reportId: selectedReport._id,
                          status: "under_review",
                          adminNotes
                        })}
                        disabled={updateReportMutation.isLoading}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
                      >
                        Mark as Under Review
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Resolution Info */}
              {(selectedReport.status === "resolved" || selectedReport.status === "dismissed") && (
                <div>
                  <h3 className="font-medium text-gray-900 mb-3">Resolution Information</h3>
                  <div className="text-sm text-gray-600">
                    {selectedReport.resolvedAt && (
                      <p>Resolved on: {new Date(selectedReport.resolvedAt).toLocaleDateString()}</p>
                    )}
                    {selectedReport.resolvedBy && (
                      <p>Resolved by: {selectedReport.resolvedBy?.firstName || 'Unknown'} {selectedReport.resolvedBy?.lastName || ''}</p>
                    )}
                    {selectedReport.adminNotes && (
                      <div className="mt-2">
                        <span className="font-medium">Admin Notes:</span>
                        <p className="text-gray-700">{selectedReport.adminNotes}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminReports;

