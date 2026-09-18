import { useState, useEffect, useMemo } from "react";
import { 
  Plus, Edit2, Trash2, Search, ShieldCheck, ToggleLeft, ToggleRight,
  MoreVertical, Users, CheckCircle2, AlertCircle, Copy,
  ArrowRight, ShieldAlert, Layers
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@food/components/ui/button";
import { Input } from "@food/components/ui/input";
import { Badge } from "@food/components/ui/badge";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@food/components/ui/dropdown-menu";
import { toast } from "react-hot-toast";
import axiosInstance from "@food/api";
import { cn } from "@/lib/utils";
import { useAuth } from "@core/context/AuthContext";
import { getCurrentUser } from "@food/utils/auth";
import { canPerformAdminPermissionAction, extractAdminPermissions, extractAdminRoleId, fetchAdminRolePermissions } from "@food/utils/adminPermissions";

export default function RoleList() {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const currentUser = useMemo(() => authUser || getCurrentUser("admin"), [authUser]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [resolvedPermissions, setResolvedPermissions] = useState({});

  const fetchRoles = async () => {
    try {
      setLoading(true);
      const response = await axiosInstance.get("/food/admin/roles");
      if (response.data.success) {
        setRoles(response.data.data || []);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch roles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  useEffect(() => {
    let isMounted = true;

    const resolvePermissions = async () => {
      if (!currentUser || currentUser.role === "ADMIN") {
        if (isMounted) setResolvedPermissions({});
        return;
      }

      const existingPermissions = extractAdminPermissions(currentUser);
      if (Object.keys(existingPermissions).length > 0) {
        if (isMounted) setResolvedPermissions(existingPermissions);
        return;
      }

      const roleId = extractAdminRoleId(currentUser);
      if (!roleId) {
        if (isMounted) setResolvedPermissions({});
        return;
      }

      try {
        const rolePermissions = await fetchAdminRolePermissions(roleId);
        if (isMounted) setResolvedPermissions(rolePermissions);
      } catch {
        if (isMounted) setResolvedPermissions({});
      }
    };

    resolvePermissions();
    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  const rolePermissionKey = "food::staff_management::roles";
  const canCreateRole = canPerformAdminPermissionAction(currentUser, resolvedPermissions, rolePermissionKey, "create");
  const canEditRole = canPerformAdminPermissionAction(currentUser, resolvedPermissions, rolePermissionKey, "edit");
  const canDeleteRole = canPerformAdminPermissionAction(currentUser, resolvedPermissions, rolePermissionKey, "delete");

  const handleToggleStatus = async (roleId) => {
    if (!canEditRole) {
      toast.error("You do not have permission to update roles");
      return;
    }
    try {
      const response = await axiosInstance.patch(`/food/admin/roles/${roleId}/toggle`);
      if (response.data.success) {
        toast.success(response.data.message);
        fetchRoles();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to toggle status");
    }
  };

  const filteredRoles = (roles || []).filter(role => 
    role.roleName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    role.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const stats = [
    { 
      label: "TOTAL ROLES", 
      value: (roles || []).length, 
      icon: Layers, 
      color: "bg-primary", 
      textColor: "text-white",
      sub: "Administrative Layers"
    },
    { 
      label: "ACTIVE", 
      value: (roles || []).filter(r => r.status === 'active').length, 
      icon: CheckCircle2, 
      color: "bg-emerald-500", 
      textColor: "text-white",
      sub: "Operational Access"
    },
    { 
      label: "INACTIVE", 
      value: (roles || []).filter(r => r.status !== 'active').length, 
      icon: ShieldAlert, 
      color: "bg-amber-100", 
      textColor: "text-amber-700",
      sub: "Restricted Access"
    }
  ];

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-neutral-200 overflow-x-hidden w-full" style={{ maxWidth: '100vw', boxSizing: 'border-box' }}>
      <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 w-full overflow-hidden" style={{ maxWidth: '100%', boxSizing: 'border-box' }}>
        
        {/* Page Header */}
        <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#334257] mb-1">Roles & Permissions</h1>
            <p className="text-sm text-[#8a94aa]">Provision and audit administrative security policies</p>
          </div>
          {canCreateRole && (
            <Button 
              onClick={() => navigate("/admin/food/employee-role/create")}
              className="w-full sm:w-auto bg-[#006fbd] hover:bg-blue-700 text-white flex items-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create New Role
            </Button>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4 sm:mb-6">
          {stats.map((stat, idx) => (
            <div key={idx} className="bg-white p-4 sm:p-5 rounded-lg border border-[#e3e6ef] shadow-sm flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium text-[#8a94aa] uppercase tracking-wider">{stat.label}</p>
                <p className="text-2xl font-bold text-[#334257]">{stat.value}</p>
              </div>
              <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", stat.color, stat.textColor)}>
                <stat.icon className="w-5 h-5" />
              </div>
            </div>
          ))}
        </div>

        {/* Toolbar & Search */}
        <div className="bg-white rounded-lg shadow-sm border border-[#e3e6ef] p-4 mb-4 sm:mb-6">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input 
              placeholder="Search roles by name or description..." 
              className="pl-10 h-10 w-full bg-white border-[#e3e6ef] text-sm focus:ring-1 focus:ring-[#006fbd]"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Roles List */}
        <div className="bg-white rounded-lg border border-[#e3e6ef] shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-12 space-y-4">
               {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-50 rounded-lg animate-pulse" />)}
            </div>
          ) : filteredRoles.length === 0 ? (
            <div className="py-16 px-6 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-16 h-16 bg-gray-50 rounded-full border border-gray-100 flex items-center justify-center">
                <ShieldCheck className="w-8 h-8 text-gray-400" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-[#334257]">No Roles Found</h3>
                <p className="text-sm text-[#8a94aa]">
                  Start by creating a role to define access boundaries for your staff members.
                </p>
              </div>
              {canCreateRole && (
                <Button 
                  onClick={() => navigate("/admin/food/employee-role/create")}
                  className="bg-[#006fbd] hover:bg-blue-700 text-white text-sm"
                >
                  Create First Role
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-[#e3e6ef]">
                    <th className="px-4 sm:px-6 py-3 text-xs font-semibold text-[#8a94aa] uppercase">Role Name</th>
                    <th className="px-4 sm:px-6 py-3 text-xs font-semibold text-[#8a94aa] uppercase">Description</th>
                    <th className="px-4 sm:px-6 py-3 text-xs font-semibold text-[#8a94aa] uppercase text-center">Permissions</th>
                    <th className="px-4 sm:px-6 py-3 text-xs font-semibold text-[#8a94aa] uppercase">Status</th>
                    <th className="px-4 sm:px-6 py-3 text-xs font-semibold text-[#8a94aa] uppercase text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e3e6ef]">
                  {filteredRoles.map((role) => (
                    <tr key={role._id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 sm:px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0",
                            role.status === 'active' ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"
                          )}>
                            {role.roleName.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-[#334257]">
                              {role.roleName}
                            </p>
                            {role.isDefault && (
                              <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded mt-1 inline-block uppercase">
                                System Core
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-4">
                        <p className="text-sm text-[#4a5671] max-w-xs truncate">
                          {role.description || "Operational boundary not explicitly defined."}
                        </p>
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-center">
                        <span className="text-xs font-medium bg-[#006fbd] text-white px-2 py-1 rounded-md">
                          {Object.keys(role.permissions || {}).length} Modules
                        </span>
                      </td>
                      <td className="px-4 sm:px-6 py-4">
                        <button 
                          onClick={() => handleToggleStatus(role._id)}
                          disabled={!canEditRole}
                          className={cn(
                            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors disabled:opacity-50",
                            role.status === 'active' 
                            ? 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200' 
                            : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
                          )}
                        >
                          {role.status === 'active' ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                          {role.status === 'active' ? 'Active' : 'Restricted'}
                        </button>
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500 hover:text-gray-900">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel className="text-xs font-medium text-gray-500 uppercase">Role Management</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {canEditRole && (
                              <DropdownMenuItem 
                                className="cursor-pointer text-sm"
                                onClick={() => navigate(`/admin/food/employee-role/edit/${role._id}`)}
                              >
                                <Edit2 className="w-4 h-4 mr-2" /> Edit Configuration
                              </DropdownMenuItem>
                            )}
                            {!role.isDefault && canDeleteRole && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                  className="cursor-pointer text-sm text-red-600 focus:text-red-600 focus:bg-red-50" 
                                  onClick={() => toast.error("Revocation requires SuperAdmin approval")}
                                >
                                  <Trash2 className="w-4 h-4 mr-2" /> Revoke Role
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
