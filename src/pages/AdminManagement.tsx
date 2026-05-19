import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useMutationWithLoading, useQueryWithLoading } from "../hooks/useLoadingHooks";
import { useQueryClient } from "react-query";
import * as apiClient from "../api-client";
import useAppContext from "../hooks/useAppContext";
import { useRoleBasedAccess } from "../hooks/useRoleBasedAccess";
import SmartImage from "../components/SmartImage";
import { Link } from "react-router-dom";
import {
  Users,
  Search,
  Shield,
  ShieldOff,
  UserPlus,
  UserMinus,
  Crown,
  Mail,
  Calendar,
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  TrendingUp,
  AlertCircle,
  Trash2,
  Power,
  PowerOff,
  FileText,
  Download,
  UserCheck,
  UserX,
  Eye,
  ArrowLeft
} from "lucide-react";
import { Button } from "../shared/ui/button";
import { Input } from "../shared/ui/input";
import { Badge } from "../shared/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../shared/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../shared/ui/dialog";
import { Separator } from "../shared/ui/separator";

const AdminManagement = () => {
  const navigate = useNavigate();
  const { showToast } = useAppContext();
  const { isAdmin } = useRoleBasedAccess();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"users" | "role-promotions">("users");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<any>(null);
  const [recentPromotions, setRecentPromotions] = useState<any[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [isDocumentsDialogOpen, setIsDocumentsDialogOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<{name: string, url: string} | null>(null);
  const [isImageGalleryOpen, setIsImageGalleryOpen] = useState(false);

  // Handle document viewing
  const handleViewDocument = (documentType: string, filename: string) => {
    if (!filename) {
      console.error('Filename is null or undefined:', filename);
      return;
    }
    
    // Extract just the filename from the full path
    const justFilename = filename.split('/').pop() || filename;
    
    // Use backend URL from environment variable
    const backendUrl = import.meta.env.VITE_API_BASE_URL || 'https://glangetaway-2-1.onrender.com';
    const documentUrl = `${backendUrl}/uploads/${justFilename}`;
    
    console.log('=== DOCUMENT VIEW DEBUG ===');
    console.log('Document Type:', documentType);
    console.log('Original Filename:', filename);
    console.log('Extracted Filename:', justFilename);
    console.log('Backend URL:', backendUrl);
    console.log('Final Document URL:', documentUrl);
    
    // Set the selected document and open the image gallery
    setSelectedDocument({ name: documentType, url: documentUrl });
    setIsImageGalleryOpen(true);
  };

  // Add to recent promotions when promotion succeeds
  const addToRecentPromotions = (user: any) => {
    const promotion = {
      userId: user._id,
      userName: `${user.firstName} ${user.lastName}`,
      userEmail: user.email,
      promotedAt: new Date(),
      previousRole: 'user',
      newRole: 'admin'
    };
    
    setRecentPromotions(prev => [promotion, ...prev.slice(0, 4)]); // Keep last 5 promotions
  };

  // Fetch all users
  const { data: users = [], isLoading } = useQueryWithLoading(
    "allUsers",
    apiClient.fetchAllUsers,
    {
      loadingMessage: "Loading users...",
      enabled: activeTab === "users",
    }
  );

  // Search users
  const { data: searchResults = [], isLoading: isSearching } = useQueryWithLoading(
    ["searchUsers", searchQuery],
    () => apiClient.searchUsers(searchQuery),
    {
      enabled: searchQuery.length > 2 && activeTab === "users",
      loadingMessage: "Searching users...",
    }
  );

  // Fetch pending role requests
  const { data: pendingRequests = [], isLoading: isLoadingRequests } = useQueryWithLoading(
    "pendingRoleRequests",
    apiClient.fetchPendingRoleRequests,
    {
      loadingMessage: "Loading pending role requests...",
      enabled: activeTab === "role-promotions",
    }
  );

  // Fetch existing resort owners
  const { data: resortOwners = [], isLoading: isLoadingOwners } = useQueryWithLoading(
    "existingResortOwners",
    () => apiClient.fetchAllUsers().then(users => users.filter(user => user.role === 'resort_owner')),
    {
      loadingMessage: "Loading resort owners...",
      enabled: activeTab === "role-promotions",
    }
  );

  // Promote user mutation
  const promoteMutation = useMutationWithLoading(apiClient.promoteUserToAdmin, {
    onSuccess: (data) => {
      showToast({
        title: "User Promoted Successfully",
        description: `${data.user.firstName} ${data.user.lastName} has been promoted to admin.`,
        type: "SUCCESS",
      });
      
      // Add to recent promotions tracking
      addToRecentPromotions(data.user);
      
      setIsDialogOpen(false);
      setSelectedUser(null);
    },
    onError: (error: Error) => {
      showToast({
        title: "Promotion Failed",
        description: error.message,
        type: "ERROR",
      });
    },
    loadingMessage: "Promoting user...",
  });

  // Demote user mutation
  const demoteMutation = useMutationWithLoading(apiClient.demoteUserToUser, {
    onSuccess: (data) => {
      showToast({
        title: "User Demoted Successfully",
        description: `${data.user.firstName} ${data.user.lastName} has been demoted to regular user.`,
        type: "SUCCESS",
      });
      
      setIsDialogOpen(false);
      setSelectedUser(null);
    },
    onError: (error: Error) => {
      showToast({
        title: "Demotion Failed",
        description: error.message,
        type: "ERROR",
      });
    },
    loadingMessage: "Demoting user...",
  });

  // Delete user mutation
  const deleteMutation = useMutationWithLoading(apiClient.deleteUser, {
    onSuccess: (data) => {
      showToast({
        title: "User Deleted Successfully",
        description: data.message,
        type: "SUCCESS",
      });
      
      setIsDeleteDialogOpen(false);
      setUserToDelete(null);
    },
    onError: (error: Error) => {
      showToast({
        title: "Deletion Failed",
        description: error.message,
        type: "ERROR",
      });
    },
    loadingMessage: "Deleting user...",
  });

  // Toggle user status mutation
  const toggleStatusMutation = useMutationWithLoading(apiClient.toggleUserStatus, {
    onSuccess: (data) => {
      showToast({
        title: `User ${data.isActive ? 'Activated' : 'Deactivated'}`,
        description: data.message,
        type: "SUCCESS",
      });
    },
    onError: (error: Error) => {
      showToast({
        title: "Status Update Failed",
        description: error.message,
        type: "ERROR",
      });
    },
    loadingMessage: "Updating user status...",
  });

  // Approve role request mutation
  const approveRequestMutation = useMutationWithLoading(apiClient.approveRoleRequest, {
    onSuccess: async (data) => {
      showToast({
        title: "Role Request Approved",
        description: `User has been promoted to resort owner.`,
        type: "SUCCESS",
      });
      
      // Add delay to allow toast to show before refreshing data
      await new Promise(resolve => setTimeout(resolve, 1000));
      queryClient.invalidateQueries("pendingRoleRequests");
      queryClient.invalidateQueries("existingResortOwners");
    },
    onError: (error: Error) => {
      showToast({
        title: "Approval Failed",
        description: error.message,
        type: "ERROR",
      });
    },
    loadingMessage: "Approving role request...",
  });

  // Decline role request mutation
  const declineRequestMutation = useMutationWithLoading(
    ({ requestId, reason }: { requestId: string; reason: string }) => 
      apiClient.declineRoleRequest(requestId, reason),
    {
      onSuccess: async (data) => {
        showToast({
          title: "Role Request Declined",
          description: `Request has been declined.`,
          type: "SUCCESS",
        });
        
        // Add delay to allow toast to show before refreshing data
        await new Promise(resolve => setTimeout(resolve, 1000));
        queryClient.invalidateQueries("pendingRoleRequests");
      },
      onError: (error: Error) => {
        showToast({
          title: "Decline Failed",
          description: error.message,
          type: "ERROR",
        });
      },
      loadingMessage: "Declining role request...",
    }
  );

  // Demote resort owner mutation
  const demoteOwnerMutation = useMutationWithLoading(
    (userId: string) => apiClient.demoteUserToUser(userId),
    {
      onSuccess: (data) => {
        showToast({
          title: "Resort Owner Demoted",
          description: `User has been demoted to regular user.`,
          type: "SUCCESS",
        });
        queryClient.invalidateQueries("existingResortOwners");
      },
      onError: (error: Error) => {
        showToast({
          title: "Demotion Failed",
          description: error.message,
          type: "ERROR",
        });
      },
      loadingMessage: "Demoting resort owner...",
    }
  );

  const handlePromoteUser = (user: any) => {
    setSelectedUser(user);
    setIsDialogOpen(true);
  };

  const confirmPromotion = () => {
    if (selectedUser) {
      promoteMutation.mutate(selectedUser._id);
    }
  };

  const confirmDemotion = () => {
    if (selectedUser) {
      demoteMutation.mutate(selectedUser._id);
    }
  };

  const confirmDelete = () => {
    if (userToDelete) {
      deleteMutation.mutate(userToDelete._id);
    }
  };

  const handleToggleStatus = (user: any) => {
    toggleStatusMutation.mutate(user._id);
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin":
        return <Badge className="bg-purple-100 text-purple-800 border-purple-200"><Crown className="w-3 h-3 mr-1" />Admin</Badge>;
      case "resort_owner":
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200"><Shield className="w-3 h-3 mr-1" />Resort Owner</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800 border-gray-200"><Users className="w-3 h-3 mr-1" />User</Badge>;
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "admin":
        return <Crown className="w-5 h-5 text-purple-600" />;
      case "resort_owner":
        return <Shield className="w-5 h-5 text-blue-600" />;
      default:
        return <Users className="w-5 h-5 text-gray-600" />;
    }
  };

  // Check if user was recently promoted
  const isRecentlyPromoted = (userId: string) => {
    return recentPromotions.some(promotion => promotion.userId === userId);
  };

  // Get promotion time for display
  const getPromotionTime = (userId: string) => {
    const promotion = recentPromotions.find(p => p.userId === userId);
    if (!promotion) return null;
    
    const now = new Date();
    const diffMs = now.getTime() - promotion.promotedAt.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)} hours ago`;
    return `${Math.floor(diffMins / 1440)} days ago`;
  };

  const displayUsers = searchQuery.length > 2 ? searchResults : users;

  // Handlers for role promotions
  const handleApproveRequest = (requestId: string) => {
    approveRequestMutation.mutate(requestId);
  };

  const handleDeclineRequest = (requestId: string, reason: string) => {
    declineRequestMutation.mutate({ requestId, reason });
  };

  const handleDemoteOwner = (userId: string) => {
    demoteOwnerMutation.mutate(userId);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => navigate(-1)}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Exit
            </Button>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center">
              <Users className="w-8 h-8 mr-3 text-primary-600" />
              User Management
            </h1>
          </div>
          <div className="flex items-center space-x-3">
            {recentPromotions.length > 0 && (
              <Badge className="bg-green-100 text-green-800 border-green-200">
                <TrendingUp className="w-3 h-3 mr-1" />
                {recentPromotions.length} recent promotion{recentPromotions.length !== 1 ? 's' : ''}
              </Badge>
            )}
            <Link to="/admin-dashboard/applications">
              <Button className="bg-blue-600 hover:bg-blue-700">
                <FileText className="w-4 h-4 mr-2" />
                Review Applications
              </Button>
            </Link>
          </div>
        </div>
        <p className="text-gray-600">
          Promote or demote users to manage admin access for the resort booking system. Users must have an approved resort owner application before promotion.
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="mb-6">
        <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
          <Button
            variant={activeTab === "users" ? "default" : "ghost"}
            onClick={() => setActiveTab("users")}
            className="flex items-center"
          >
            <Users className="w-4 h-4 mr-2" />
            Users
          </Button>
          <Button
            variant={activeTab === "role-promotions" ? "default" : "ghost"}
            onClick={() => setActiveTab("role-promotions")}
            className="flex items-center"
          >
            <Crown className="w-4 h-4 mr-2" />
            Role Promotions
          </Button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "users" && (
        <>
          {/* Recent Promotions Section */}
          {recentPromotions.length > 0 && (
            <Card className="mb-8 border-green-200 bg-green-50">
              <CardHeader>
                <CardTitle className="flex items-center text-green-800">
                  <TrendingUp className="w-5 h-5 mr-2" />
                  Recent Promotions
                </CardTitle>
                <CardDescription className="text-green-700">
                  Users who have been recently promoted to admin role
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {recentPromotions.map((promotion, index) => (
                    <div key={`${promotion.userId}-${index}`} className="flex items-center justify-between p-3 bg-white rounded-lg border border-green-200">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                          <UserPlus className="w-4 h-4 text-green-600" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{promotion.userName}</div>
                          <div className="text-sm text-gray-600">{promotion.userEmail}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge className="bg-green-100 text-green-800 border-green-200 mb-1">
                          Promoted to Admin
                        </Badge>
                        <div className="text-xs text-gray-500 flex items-center">
                          <Clock className="w-3 h-3 mr-1" />
                          {getPromotionTime(promotion.userId)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Search Bar */}
          <Card className="mb-6">
            <CardContent className="p-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <Input
                  type="text"
                  placeholder="Search users by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 animate-spin" />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Users List */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center">
                  <Users className="w-5 h-5 mr-2" />
                  All Users ({displayUsers.length})
                </span>
                {searchQuery && (
                  <Badge variant="outline" className="text-sm">
                    Search: "{searchQuery}"
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
                  <span className="ml-2 text-gray-600">Loading users...</span>
                </div>
              ) : displayUsers.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 text-lg">
                    {searchQuery ? "No users found matching your search." : "No users found."}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {displayUsers.map((user: any) => (
                    <div
                      key={user._id}
                      className={`flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors ${
                        isRecentlyPromoted(user._id) ? 'border-green-300 bg-green-50' : ''
                      }`}
                    >
                      <div className="flex items-center space-x-4">
                        <div className="relative">
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                            user.isActive ? 'bg-gray-200' : 'bg-gray-100 opacity-50'
                          }`}>
                            {getRoleIcon(user.role)}
                          </div>
                          {isRecentlyPromoted(user._id) && (
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                              <CheckCircle className="w-3 h-3 text-white" />
                            </div>
                          )}
                          {!user.isActive && (
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                              <PowerOff className="w-3 h-3 text-white" />
                            </div>
                          )}
                        </div>
                        <div className={`${!user.isActive ? 'opacity-50' : ''}`}>
                          <div className="font-semibold text-gray-900 flex items-center">
                            {user.firstName} {user.lastName}
                            {isRecentlyPromoted(user._id) && (
                              <Badge className="ml-2 bg-green-100 text-green-800 border-green-200 text-xs">
                                <AlertCircle className="w-3 h-3 mr-1" />
                                Recently Promoted
                              </Badge>
                            )}
                            {!user.isActive && (
                              <Badge className="ml-2 bg-red-100 text-red-800 border-red-200 text-xs">
                                <PowerOff className="w-3 h-3 mr-1" />
                                Disabled
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center text-sm text-gray-600">
                            <Mail className="w-4 h-4 mr-1" />
                            {user.email}
                          </div>
                          <div className="flex items-center text-sm text-gray-500 mt-1">
                            <Calendar className="w-4 h-4 mr-1" />
                            Joined {new Date(user.createdAt).toLocaleDateString()}
                            {isRecentlyPromoted(user._id) && (
                              <span className="ml-3 text-green-600 font-medium">
                                <Clock className="w-3 h-3 mr-1 inline" />
                                Promoted {getPromotionTime(user._id)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3">
                        {getRoleBadge(user.role)}

                        {user.role !== "admin" && (
                          <div className="flex space-x-2">
                            {user.role === "user" ? (
                              <Dialog open={isDialogOpen && selectedUser?._id === user._id} onOpenChange={setIsDialogOpen}>
                                <DialogTrigger>
                                  <Button
                                    onClick={() => handlePromoteUser(user)}
                                    variant="outline"
                                    size="sm"
                                    className="border-green-200 text-green-700 hover:bg-green-50"
                                  >
                                    <UserPlus className="w-4 h-4 mr-1" />
                                    Promote
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle className="flex items-center">
                                      <Shield className="w-5 h-5 mr-2 text-blue-600" />
                                      Promote User to Resort Owner
                                    </DialogTitle>
                                    <DialogDescription>
                                      Are you sure you want to promote <strong>{user.firstName} {user.lastName}</strong>
                                      ({user.email}) to resort owner role? This will give them access to manage their own resorts.
                                    </DialogDescription>
                                  </DialogHeader>
                                  <DialogFooter>
                                    <Button
                                      variant="outline"
                                      onClick={() => setIsDialogOpen(false)}
                                      disabled={promoteMutation.isLoading}
                                    >
                                      Cancel
                                    </Button>
                                    <Button
                                      onClick={confirmPromotion}
                                      disabled={promoteMutation.isLoading}
                                      className="bg-green-600 hover:bg-green-700"
                                    >
                                      {promoteMutation.isLoading ? (
                                        <>
                                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                          Promoting...
                                        </>
                                      ) : (
                                        <>
                                          <UserPlus className="w-4 h-4 mr-2" />
                                          Promote to Admin
                                        </>
                                      )}
                                    </Button>
                                  </DialogFooter>
                                </DialogContent>
                              </Dialog>
                            ) : (
                              <Dialog open={isDialogOpen && selectedUser?._id === user._id} onOpenChange={setIsDialogOpen}>
                                <DialogTrigger>
                                  <Button
                                    onClick={() => handlePromoteUser(user)}
                                    variant="outline"
                                    size="sm"
                                    className="border-orange-200 text-orange-700 hover:bg-orange-50"
                                  >
                                    <UserMinus className="w-4 h-4 mr-1" />
                                    Demote
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle className="flex items-center">
                                      <ShieldOff className="w-5 h-5 mr-2 text-orange-600" />
                                      Demote Admin to User
                                    </DialogTitle>
                                    <DialogDescription>
                                      Are you sure you want to demote <strong>{user.firstName} {user.lastName}</strong>
                                      ({user.email}) to regular user role? This will remove their access to admin features.
                                    </DialogDescription>
                                  </DialogHeader>
                                  <DialogFooter>
                                    <Button
                                      variant="outline"
                                      onClick={() => setIsDialogOpen(false)}
                                      disabled={demoteMutation.isLoading}
                                    >
                                      Cancel
                                    </Button>
                                    <Button
                                      onClick={confirmDemotion}
                                      disabled={demoteMutation.isLoading}
                                      className="bg-orange-600 hover:bg-orange-700"
                                    >
                                      {demoteMutation.isLoading ? (
                                        <>
                                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                          Demoting...
                                        </>
                                      ) : (
                                        <>
                                          <UserMinus className="w-4 h-4 mr-2" />
                                          Demote to User
                                        </>
                                      )}
                                    </Button>
                                  </DialogFooter>
                                </DialogContent>
                              </Dialog>
                            )}
                          </div>
                        )}

                        {/* Delete Confirmation Dialog */}
                        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle className="flex items-center">
                                <Trash2 className="w-5 h-5 mr-2 text-red-600" />
                                Delete User Account
                              </DialogTitle>
                              <DialogDescription>
                                Are you sure you want to permanently delete <strong>{userToDelete?.firstName} {userToDelete?.lastName}</strong>
                                ({userToDelete?.email})? This action cannot be undone and will remove all their data.
                              </DialogDescription>
                            </DialogHeader>
                            <DialogFooter>
                              <Button
                                variant="outline"
                                onClick={() => setIsDeleteDialogOpen(false)}
                                disabled={deleteMutation.isLoading}
                              >
                                Cancel
                              </Button>
                              <Button
                                onClick={confirmDelete}
                                disabled={deleteMutation.isLoading}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                {deleteMutation.isLoading ? (
                                  <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Deleting...
                                  </>
                                ) : (
                                  <>
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Delete User
                                  </>
                                )}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>

                        {/* Delete and Disable buttons for all users except current admin */}
                        <div className="flex space-x-2">
                          <Button
                            onClick={() => handleToggleStatus(user)}
                            variant="outline"
                            size="sm"
                            className={`${
                              user.isActive
                                ? 'border-orange-200 text-orange-700 hover:bg-orange-50'
                                : 'border-green-200 text-green-700 hover:bg-green-50'
                            }`}
                          >
                            {user.isActive ? (
                              <>
                                <PowerOff className="w-4 h-4 mr-1" />
                                Disable
                              </>
                            ) : (
                              <>
                                <Power className="w-4 h-4 mr-1" />
                                Enable
                              </>
                            )}
                          </Button>

                          <Button
                            onClick={() => {
                              setUserToDelete(user);
                              setIsDeleteDialogOpen(true);
                            }}
                            variant="outline"
                            size="sm"
                            className="border-red-200 text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {activeTab === "role-promotions" && (
        <>
          {/* Pending Role Requests */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="w-5 h-5 mr-2" />
                Pending Role Requests ({pendingRequests.length})
              </CardTitle>
              <CardDescription>
                Review and approve/decline requests for resort owner roles
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingRequests ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
                  <span className="ml-2 text-gray-600">Loading pending requests...</span>
                </div>
              ) : pendingRequests.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 text-lg">No pending role requests.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b">
                      <tr>
                        <th className="text-left p-3 font-medium">User</th>
                        <th className="text-left p-3 font-medium">Request Date</th>
                        <th className="text-left p-3 font-medium">Permit</th>
                        <th className="text-left p-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingRequests.map((request: any) => (
                        <tr key={request._id} className="border-b hover:bg-gray-50">
                          <td className="p-3">
                            <div>
                              <div className="font-medium">{request.userId?.firstName || 'Unknown'} {request.userId?.lastName || ''}</div>
                              <div className="text-sm text-gray-600">{request.userId?.email || 'No email'}</div>
                            </div>
                          </td>
                          <td className="p-3">
                            {new Date(request.createdAt).toLocaleDateString()}
                          </td>
                          <td className="p-3">
                            <Button
                              onClick={() => {
                                setSelectedRequest(request);
                                setIsDocumentsDialogOpen(true);
                              }}
                              variant="ghost"
                              size="sm"
                              className="text-blue-600 hover:text-blue-700"
                            >
                              View Documents
                            </Button>
                          </td>
                          <td className="p-3">
                            <div className="flex space-x-2">
                              <Button
                                onClick={() => handleApproveRequest(request._id)}
                                size="sm"
                                className="bg-green-600 hover:bg-green-700"
                                disabled={approveRequestMutation.isLoading}
                              >
                                {approveRequestMutation.isLoading ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <UserCheck className="w-4 h-4" />
                                )}
                              </Button>
                              <Button
                                onClick={() => {
                                  const reason = prompt("Please enter a reason for declining this application:");
                                  if (reason) {
                                    handleDeclineRequest(request._id, reason);
                                  }
                                }}
                                variant="outline"
                                size="sm"
                                className="border-red-200 text-red-700 hover:bg-red-50"
                                disabled={declineRequestMutation.isLoading}
                              >
                                {declineRequestMutation.isLoading ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <UserX className="w-4 h-4" />
                                )}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Existing Resort Owners */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Crown className="w-5 h-5 mr-2" />
                Existing Resort Owners ({resortOwners.length})
              </CardTitle>
              <CardDescription>
                Manage current resort owners and their permissions
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingOwners ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
                  <span className="ml-2 text-gray-600">Loading resort owners...</span>
                </div>
              ) : resortOwners.length === 0 ? (
                <div className="text-center py-12">
                  <Crown className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 text-lg">No resort owners found.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {resortOwners.map((owner: any) => (
                    <div key={owner._id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                          <Crown className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                          <div className="font-semibold text-gray-900">{owner.firstName} {owner.lastName}</div>
                          <div className="flex items-center text-sm text-gray-600">
                            <Mail className="w-4 h-4 mr-1" />
                            {owner.email}
                          </div>
                          <div className="flex items-center text-sm text-gray-500 mt-1">
                            <Calendar className="w-4 h-4 mr-1" />
                            Became owner {new Date(owner.promotedAt || owner.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <Button
                        onClick={() => handleDemoteOwner(owner._id)}
                        variant="outline"
                        size="sm"
                        className="border-orange-200 text-orange-700 hover:bg-orange-50"
                        disabled={demoteOwnerMutation.isLoading}
                      >
                        {demoteOwnerMutation.isLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <UserMinus className="w-4 h-4 mr-1" />
                            Demote
                          </>
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Documents Dialog */}
      <Dialog open={isDocumentsDialogOpen} onOpenChange={setIsDocumentsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Application Documents</DialogTitle>
            <DialogDescription>
              All documents submitted by {selectedRequest?.userId?.firstName} {selectedRequest?.userId?.lastName}
            </DialogDescription>
          </DialogHeader>
          {selectedRequest?.documents && (
            <div className="grid grid-cols-2 gap-4 mt-4">
              {Object.entries(selectedRequest.documents).map(([key, url]: [string, any]) => (
                <div key={key} className="border rounded-lg p-4">
                  <h4 className="font-medium mb-2 capitalize">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </h4>
                  {url && (
                    <Button
                      variant="link"
                      size="sm"
                      onClick={() => handleViewDocument(key.replace(/([A-Z])/g, ' $1').trim(), url)}
                      className="text-blue-600 hover:underline text-sm p-0 h-auto"
                    >
                      View Document
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDocumentsDialogOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Gallery Modal */}
      <Dialog open={isImageGalleryOpen} onOpenChange={setIsImageGalleryOpen}>
        <DialogContent className="max-w-6xl w-full h-[90vh] p-0">
          <DialogHeader className="p-6 pb-4">
            <DialogTitle className="text-xl font-semibold">
              {selectedDocument?.name}
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-600">
              Scroll to view the full document. Use the download button to save.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-auto p-6 pt-0">
            {selectedDocument && (
              <div className="space-y-4">
                <div className="border rounded-lg overflow-hidden bg-gray-50">
                  <img
                    src={selectedDocument.url}
                    alt={selectedDocument.name}
                    className="w-full h-auto max-w-full object-contain"
                    style={{ maxHeight: '60vh' }}
                    onError={(e) => {
                      console.error('Image failed to load:', selectedDocument.url);
                      e.currentTarget.src = '/placeholder-document.png';
                    }}
                    onLoad={() => {
                      console.log('Image loaded successfully:', selectedDocument.url);
                    }}
                  />
                </div>
                
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600">
                    <p>Document: {selectedDocument.name}</p>
                    <p className="text-xs mt-1">If the image appears blurry, try downloading for full quality</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (selectedDocument.url) {
                          const link = document.createElement('a');
                          link.href = selectedDocument.url;
                          link.download = `${selectedDocument.name}.jpg`;
                          link.target = '_blank';
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                        }
                      }}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsImageGalleryOpen(false)}
                    >
                      Close
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminManagement;
