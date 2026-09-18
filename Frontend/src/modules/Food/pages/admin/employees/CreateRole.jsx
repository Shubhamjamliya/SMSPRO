import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { 
  ChevronLeft, ShieldCheck, ChevronRight, ChevronDown,
  Check, Info, Search, ListFilter, Layers, 
  Maximize2, Minimize2, CheckSquare, Square, Copy, Trash2
} from "lucide-react";
import { Button } from "@food/components/ui/button";
import { Input } from "@food/components/ui/input";
import { Textarea } from "@food/components/ui/textarea";
import { Checkbox } from "@food/components/ui/checkbox";
import { toast } from "react-hot-toast";
import axiosInstance from "@food/api";
import { generatePermissionTree } from "@food/utils/permissionGenerator";
import { cn } from "@/lib/utils";
import { getCachedSettings } from "@/modules/common/utils/businessSettings";
import FormActions from "@/shared/components/admin/FormActions";
import { formInputClass } from "@/shared/components/admin/FormField";

export default function CreateRole() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  const [roleData, setRoleData] = useState({
    roleName: "",
    description: "",
    permissions: {}, // Flat map for API: { key: { view: true, ... } }
  });
  
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [enabledModules, setEnabledModules] = useState(() => {
    const cached = getCachedSettings();
    return cached?.modules || null;
  });
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  const buildSubmitPermissions = (permissions) => {
    const nextPermissions = { ...(permissions || {}) };
    // Preserving dashboard permissions as explicitly requested by user
    return nextPermissions;
  };

  // Generate tree from sidebar configs
  const rawPermissionTree = useMemo(() => generatePermissionTree(enabledModules), [enabledModules]);

  // Filter tree based on search
  const permissionTree = useMemo(() => {
    if (!searchQuery.trim()) return rawPermissionTree;
    
    const filterNodes = (nodes) => {
      return nodes.map(node => {
        const matches = node.label.toLowerCase().includes(searchQuery.toLowerCase());
        const filteredChildren = node.children ? filterNodes(node.children) : [];
        
        if (matches || filteredChildren.length > 0) {
          return { ...node, children: filteredChildren };
        }
        return null;
      }).filter(Boolean);
    };
    
    return filterNodes(rawPermissionTree);
  }, [rawPermissionTree, searchQuery]);

  useEffect(() => {
    const initPage = async () => {
      try {
        setFetching(true);
        const settingsRes = await axiosInstance.get("/common/settings");
        const settings = settingsRes.data.data || settingsRes.data;
        if (settings?.modules) setEnabledModules(settings.modules);

        if (isEdit) {
          const roleRes = await axiosInstance.get(`/food/admin/roles/${id}`);
          if (roleRes.data.success) {
            const data = roleRes.data.data;
            setRoleData({
              roleName: data.roleName,
              description: data.description || "",
              permissions: data.permissions || {},
            });
            // Auto expand roots for edit
            setExpandedNodes(new Set(["food", "quick", "global"]));
          }
        } else {
          setExpandedNodes(new Set(["food", "quick", "global"]));
        }
      } catch (error) {
        const cached = getCachedSettings();
        if (!cached?.modules) {
          toast.error("Failed to load page data");
          if (isEdit) navigate("/admin/food/employee-role");
        } else {
          console.warn("Failed to fetch fresh settings, using cached settings:", error);
          if (isEdit) {
            // Still try to load the role even if settings failed but we have cache
            try {
              const roleRes = await axiosInstance.get(`/food/admin/roles/${id}`);
              if (roleRes.data.success) {
                const data = roleRes.data.data;
                setRoleData({
                  roleName: data.roleName,
                  description: data.description || "",
                  permissions: data.permissions || {},
                });
                setExpandedNodes(new Set(["food", "quick", "global"]));
              }
            } catch (roleError) {
              toast.error("Failed to load role data");
              navigate("/admin/food/employee-role");
            }
          }
        }
      } finally {
        setFetching(false);
      }
    };
    initPage();
  }, [id, isEdit, navigate]);

  const toggleExpand = (nodeKey) => {
    const newSet = new Set(expandedNodes);
    if (newSet.has(nodeKey)) newSet.delete(nodeKey);
    else newSet.add(nodeKey);
    setExpandedNodes(newSet);
  };

  const expandAll = () => {
    const allKeys = new Set();
    const collectKeys = (nodes) => {
      nodes.forEach(n => {
        if (n.children && n.children.length > 0) {
          allKeys.add(n.permissionKey);
          collectKeys(n.children);
        }
      });
    };
    collectKeys(rawPermissionTree);
    setExpandedNodes(allKeys);
  };

  const collapseAll = () => setExpandedNodes(new Set());

  /**
   * Logic Fix: Child select -> auto preserve parent visibility
   */
  const ensureParentVisibility = (targetKey, newPermissions) => {
    const parts = targetKey.split('::');
    if (parts.length <= 1) return;

    for (let i = 1; i < parts.length; i++) {
      const parentKey = parts.slice(0, i).join('::');
      if (!newPermissions[parentKey]) {
        newPermissions[parentKey] = { view: false, create: false, edit: false, delete: false };
      }
      newPermissions[parentKey].view = true;
    }
  };

  /**
   * Checkbox Logic Fix
   */
  const handlePermissionChange = (node, action, isChecked) => {
    const newPermissions = { ...roleData.permissions };
    const key = node.permissionKey;

    if (!newPermissions[key]) {
      newPermissions[key] = { view: false, create: false, edit: false, delete: false };
    }

    newPermissions[key][action] = isChecked;

    // Rule 2: If create/edit/delete selected -> AUTO enable View
    if (isChecked && (action === "create" || action === "edit" || action === "delete")) {
      newPermissions[key].view = true;
    }

    // Rule 3: Unchecking View -> remove all other actions
    if (!isChecked && action === "view") {
      newPermissions[key].create = false;
      newPermissions[key].edit = false;
      newPermissions[key].delete = false;
    }

    // Rule 5: Child select -> preserve parent visibility
    if (isChecked) {
      ensureParentVisibility(key, newPermissions);
    }

    setRoleData(prev => ({ ...prev, permissions: newPermissions }));
  };

  /**
   * Select All Section (Explicit Action)
   */
  const handleSectionSelectAll = (node, isChecked) => {
    const newPermissions = { ...roleData.permissions };
    const actions = ["view", "create", "edit", "delete"];
    
    const applyRecursive = (n) => {
      const k = n.permissionKey;
      if (!newPermissions[k]) newPermissions[k] = { view: false, create: false, edit: false, delete: false };
      actions.forEach(a => {
        const isAllowed = !n.allowedActions || n.allowedActions.includes(a);
        if (isAllowed) {
          newPermissions[k][a] = isChecked;
        }
      });
      if (n.children) n.children.forEach(applyRecursive);
    };

    applyRecursive(node);
    if (isChecked) ensureParentVisibility(node.permissionKey, newPermissions);

    setRoleData(prev => ({ ...prev, permissions: newPermissions }));
  };

  const getModuleState = (moduleKey) => {
    const rootNode = rawPermissionTree.find(n => n.permissionKey === moduleKey);
    if (!rootNode) return { checked: false, indeterminate: false };

    let totalApplicable = 0;
    let totalSelected = 0;

    const traverse = (n) => {
      if (!n.children || n.children.length === 0) {
        const permissions = roleData.permissions[n.permissionKey] || { view: false, create: false, edit: false, delete: false };
        const actions = ["view", "create", "edit", "delete"];
        actions.forEach(a => {
          const isAllowed = !n.allowedActions || n.allowedActions.includes(a);
          if (isAllowed) {
            totalApplicable++;
            if (permissions[a]) {
              totalSelected++;
            }
          }
        });
      } else {
        n.children.forEach(traverse);
      }
    };

    traverse(rootNode);

    if (totalApplicable === 0) return { checked: false, indeterminate: false };
    return {
      checked: totalSelected === totalApplicable,
      indeterminate: totalSelected > 0 && totalSelected < totalApplicable
    };
  };

  const foodState = useMemo(() => getModuleState("food"), [roleData.permissions, rawPermissionTree]);
  const quickState = useMemo(() => getModuleState("quick"), [roleData.permissions, rawPermissionTree]);

  const selectedCount = useMemo(() => {
    let count = 0;
    Object.values(roleData.permissions).forEach(p => {
      if (p.view || p.create || p.edit || p.delete) count++;
    });
    return count;
  }, [roleData.permissions]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!roleData.roleName.trim()) return toast.error("Role name is required");

    try {
      setLoading(true);
      const url = isEdit ? `/food/admin/roles/${id}` : "/food/admin/roles";
      const method = isEdit ? "patch" : "post";
      const payload = {
        ...roleData,
        permissions: buildSubmitPermissions(roleData.permissions),
      };
      
      const response = await axiosInstance[method](url, payload);
      if (response.data.success) {
        toast.success(response.data.message);
        navigate("/admin/food/employee-role");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to save role");
    } finally {
      setLoading(false);
    }
  };

  const renderPermissionNode = (node, depth = 0) => {
    const isExpanded = expandedNodes.has(node.permissionKey);
    const hasChildren = node.children && node.children.length > 0;
    const permissions = roleData.permissions[node.permissionKey] || { view: false, create: false, edit: false, delete: false };
    
    const actionIcons = {
      view: { icon: "👁", label: "View", color: "text-blue-500" },
      create: { icon: "➕", label: "Create", color: "text-green-500" },
      edit: { icon: "✏️", label: "Edit", color: "text-amber-500" },
      delete: { icon: "🗑", label: "Delete", color: "text-red-500" }
    };

    return (
      <div key={node.permissionKey} className="flex flex-col">
        <div 
          className={cn(
            "flex flex-col sm:flex-row sm:items-center justify-between py-3 px-4 gap-3 sm:gap-0 border-b border-slate-200 hover:bg-gray-50 transition-colors group",
            depth === 0 && "bg-gray-50 border-slate-200",
            depth === 1 && "bg-white"
          )}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div 
              className="flex items-center gap-2 cursor-pointer select-none" 
              onClick={() => hasChildren && toggleExpand(node.permissionKey)}
              style={{ paddingLeft: `${depth * 20}px` }}
            >
              {hasChildren ? (
                isExpanded ? 
                  <ChevronDown className="w-4 h-4 text-neutral-400 shrink-0" /> : 
                  <ChevronRight className="w-4 h-4 text-neutral-400 shrink-0" />
              ) : (
                <div className="w-4 shrink-0" />
              )}
              {depth === 0 && (node.permissionKey === "food" || node.permissionKey === "quick") && (
                <div onClick={(e) => e.stopPropagation()} className="shrink-0 flex items-center mr-1">
                  <Checkbox 
                    checked={
                      node.permissionKey === "food" 
                        ? (foodState.checked ? true : foodState.indeterminate ? "indeterminate" : false)
                        : (quickState.checked ? true : quickState.indeterminate ? "indeterminate" : false)
                    }
                    onCheckedChange={(checked) => {
                      handleSectionSelectAll(node, checked === true || checked === "indeterminate");
                    }}
                    className="border-gray-300 rounded text-blue-600"
                  />
                </div>
              )}
              <span className={cn(
                "text-sm truncate select-none",
                depth === 0 ? "font-bold text-slate-900 uppercase tracking-wider" :
                depth === 1 ? "font-semibold text-slate-900" : "text-slate-600 font-medium"
              )}>
                {node.label}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0 justify-start sm:justify-end w-full sm:w-auto mt-2 sm:mt-0 pl-7 sm:pl-0">
            {depth === 0 ? null : (
              <>
                {["view", "create", "edit", "delete"].map(action => {
                  const isAllowed = !node.allowedActions || node.allowedActions.includes(action);
                  if (hasChildren || !isAllowed) return null;
                  
                  return (
                    <button
                      key={action}
                      type="button"
                      onClick={() => handlePermissionChange(node, action, !permissions[action])}
                      className={cn(
                        "flex items-center px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all border",
                        permissions[action]
                          ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-gray-50"
                      )}
                    >
                      {actionIcons[action].label}
                    </button>
                  );
                })}

                {!hasChildren && (
                   <button 
                    type="button"
                    onClick={() => {
                      const applicableActions = ["view", "create", "edit", "delete"].filter(a => !node.allowedActions || node.allowedActions.includes(a));
                      const allSelected = applicableActions.length > 0 && applicableActions.every(a => permissions[a]);
                      handleSectionSelectAll(node, !allSelected);
                    }}
                    className={cn(
                      "text-[11px] font-bold px-3 py-1.5 rounded-md transition-all border ml-1",
                      (() => {
                        const applicableActions = ["view", "create", "edit", "delete"].filter(a => !node.allowedActions || node.allowedActions.includes(a));
                        return applicableActions.length > 0 && applicableActions.every(a => permissions[a]);
                      })()
                        ? "bg-blue-50 text-blue-600 border-blue-200"
                        : "bg-gray-100 text-gray-500 border-slate-200 hover:bg-gray-200"
                    )}
                   >
                     ALL
                   </button>
                )}
              </>
            )}
          </div>
        </div>

        {isExpanded && hasChildren && (
          <div className={cn(
            "flex flex-col",
            depth === 0 && "bg-gray-50/50"
          )}>
            {node.children.map(child => renderPermissionNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (fetching) return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-neutral-400">
      <Layers className="w-12 h-12 animate-pulse" />
      <p className="text-sm font-bold animate-pulse">Initializing Role Engine...</p>
    </div>
  );

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-neutral-200 overflow-x-hidden w-full" style={{ maxWidth: '100vw', boxSizing: 'border-box' }}>
      <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 w-full overflow-hidden" style={{ maxWidth: '100%', boxSizing: 'border-box' }}>
      
      {/* Sticky Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between bg-white p-4 rounded-lg border border-slate-200 shadow-sm mb-4 sm:mb-6 gap-4 sticky top-4 z-20">
        <div className="flex items-center gap-4">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => navigate("/admin/food/employee-role")}
            className="rounded-md hover:bg-gray-100 h-10 w-10 shrink-0"
          >
            <ChevronLeft className="w-5 h-5 text-slate-900" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
              {isEdit ? "Edit Access Role" : "Create Staff Role"}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">Define granular access levels for administrative modules.</p>
          </div>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <div className="hidden md:flex flex-col items-end mr-2">
            <span className="text-xs font-semibold text-blue-600">{selectedCount} Permissions</span>
            <span className="text-[10px] text-gray-500 uppercase">Selected</span>
          </div>
          <FormActions
            onCancel={() => navigate("/admin/food/employee-role")}
            submitLabel={
              loading ? "Saving..." : (isEdit ? "Update Role" : "Save Role")
            }
            submitting={loading}
            submitType="button"
            onSubmit={handleSubmit}
            className="w-auto gap-3"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start">
        {/* Left: Info (35%) */}
        <div className="lg:col-span-4 space-y-4 sm:space-y-6 lg:sticky lg:top-[100px]">
          <div className="bg-white p-4 sm:p-6 rounded-lg border border-slate-200 shadow-sm space-y-6">
            <div className="flex items-center gap-2 pb-4 border-b border-slate-200">
               <Info className="w-4 h-4 text-gray-500" />
               <h3 className="font-semibold text-slate-900 text-sm uppercase tracking-wider">Primary Config</h3>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Role Title</label>
                <Input
                  value={roleData.roleName}
                  onChange={(e) => setRoleData(prev => ({ ...prev, roleName: e.target.value }))}
                  placeholder="e.g. Senior Order Manager"
                  className={cn(formInputClass, "h-10")}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Scope Description</label>
                <Textarea
                  value={roleData.description}
                  onChange={(e) => setRoleData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe the operational boundaries of this role..."
                  className={cn(formInputClass, "min-h-[120px]")}
                />
              </div>
            </div>
          </div>

          <div className="bg-blue-50 p-4 sm:p-6 rounded-lg border border-blue-100 space-y-4">
            <div className="flex items-center gap-2 text-blue-800">
              <Layers className="w-4 h-4" />
              <h4 className="font-semibold text-xs uppercase tracking-wider">Permission Logic</h4>
            </div>
            <div className="space-y-3 text-xs text-blue-800/90">
               <div className="flex gap-3">
                  <div className="w-5 h-5 rounded bg-blue-100 flex items-center justify-center shrink-0 font-bold">1</div>
                  <p className="leading-relaxed">Actions (Create/Edit/Delete) automatically grant 'View' access.</p>
               </div>
               <div className="flex gap-3">
                  <div className="w-5 h-5 rounded bg-blue-100 flex items-center justify-center shrink-0 font-bold">2</div>
                  <p className="leading-relaxed">Removing 'View' access will instantly revoke all operational actions.</p>
               </div>
               <div className="flex gap-3">
                  <div className="w-5 h-5 rounded bg-blue-100 flex items-center justify-center shrink-0 font-bold">3</div>
                  <p className="leading-relaxed">Hierarchical Select allows provisioning sub-trees instantly.</p>
               </div>
            </div>
          </div>
        </div>

        {/* Right: Tree (65%) */}
        <div className="lg:col-span-8">
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            {/* Tree Toolbar */}
            <div className="p-4 bg-white border-b border-slate-200 flex flex-col md:flex-row items-center gap-4">
               <div className="relative flex-1 w-full">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                 <input
                  type="text"
                  placeholder="Search permissions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-md pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                 />
               </div>
               <div className="flex items-center gap-2 shrink-0">
                 <Button type="button" variant="outline" size="sm" onClick={expandAll} className="rounded-md text-xs border-slate-300 hover:bg-gray-50 h-9">
                   <Maximize2 className="w-3 h-3 mr-1" /> Expand All
                 </Button>
                 <Button type="button" variant="outline" size="sm" onClick={collapseAll} className="rounded-md text-xs border-slate-300 hover:bg-gray-50 h-9">
                   <Minimize2 className="w-3 h-3 mr-1" /> Collapse All
                 </Button>
                </div>
             </div>

            {/* Module Quick Access Toggles */}
            <div className="p-4 bg-gray-50 border-b border-slate-200 flex flex-col sm:flex-row flex-wrap sm:items-center gap-3 sm:gap-6">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Quick Section Toggles:</span>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="toggle-food-module"
                  checked={foodState.checked ? true : foodState.indeterminate ? "indeterminate" : false}
                  onCheckedChange={(checked) => {
                    const rootNode = rawPermissionTree.find(n => n.permissionKey === "food");
                    if (rootNode) {
                      handleSectionSelectAll(rootNode, checked === true || checked === "indeterminate");
                    }
                  }}
                  className="border-gray-300 rounded text-blue-600"
                />
                <label htmlFor="toggle-food-module" className="text-sm font-medium text-slate-900 cursor-pointer select-none flex items-center">
                  🍔 Food Section
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="toggle-quick-module"
                  checked={quickState.checked ? true : quickState.indeterminate ? "indeterminate" : false}
                  onCheckedChange={(checked) => {
                    const rootNode = rawPermissionTree.find(n => n.permissionKey === "quick");
                    if (rootNode) {
                      handleSectionSelectAll(rootNode, checked === true || checked === "indeterminate");
                    }
                  }}
                  className="border-gray-300 rounded text-blue-600"
                />
                <label htmlFor="toggle-quick-module" className="text-sm font-medium text-slate-900 cursor-pointer select-none flex items-center">
                  ⚡ Quick Commerce Section
                </label>
              </div>
            </div>

             {/* Tree Container */}
            <div className="bg-white min-h-[400px] max-h-[600px] overflow-auto custom-scrollbar flex flex-col relative w-full">
              {permissionTree.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3 py-16">
                  <Search className="w-8 h-8 opacity-50" />
                  <p className="text-sm">No permissions match your search</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-200 w-full">
                  {permissionTree.map(module => renderPermissionNode(module))}
                </div>
              )}
            </div>

            {/* Tree Footer Info */}
            <div className="hidden sm:flex p-3 bg-gray-50 border-t border-slate-200 items-center justify-between text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
               <div className="flex items-center gap-4">
                 <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-blue-600" /> Active Inheritance</div>
                 <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-gray-300" /> System Default</div>
               </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
