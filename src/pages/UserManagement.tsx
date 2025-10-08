import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useUser, UserProfile } from "@/context/UserContext"; // Assuming UserProfile is exported
import { useInventory } from "@/context/InventoryContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Navigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Users, UserRound, Building, Edit, Trash } from "lucide-react";
import { useToast } from "@/components/ui/use-toast"; // Corrected hook path

// Define a default state structure for the form
const initialFormData = {
  password: "",
  email: "",
  name: "",
  role: "auditor" as "admin" | "auditor" | "client",
  companyId: "",
  assignedLocations: [] as string[],
  assignedCompanies: [] as string[],
};

const UserManagement = () => {
  const { currentUser, users, registerUser, updateUser, deleteUser, hasPermission } = useUser();
  const { locations, companies } = useInventory(); // Assuming companies comes from this context
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isEditUserOpen, setIsEditUserOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const { toast } = useToast();
  
  const [formData, setFormData] = useState(initialFormData);

  // If the user doesn't have permission, redirect them.
  if (!hasPermission("manageUsers")) {
    return <Navigate to="/" replace />;
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleRoleChange = (value: string) => {
    setFormData(prev => ({ ...prev, role: value as "admin" | "auditor" | "client" }));
  };

  const handleLocationToggle = (locationId: string) => {
    setFormData(prev => ({
      ...prev,
      assignedLocations: prev.assignedLocations.includes(locationId)
        ? prev.assignedLocations.filter(id => id !== locationId)
        : [...prev.assignedLocations, locationId]
    }));
  };
  
  // FIX: Added missing handler for company toggling
  const handleCompanyToggle = (companyId: string) => {
    setFormData(prev => ({
        ...prev,
        assignedCompanies: prev.assignedCompanies.includes(companyId)
            ? prev.assignedCompanies.filter(id => id !== companyId)
            : [...prev.assignedCompanies, companyId]
    }));
  };

  const handleAddUser = async () => {
    try {
      await registerUser(
        {
          email: formData.email,
          name: formData.name,
          role: formData.role,
          assignedLocations: formData.assignedLocations,
          assignedCompanies: formData.assignedCompanies,
          companyId: formData.companyId
        },
        formData.password
      );
      
      toast({
        title: "User created",
        description: `${formData.name} has been added as a ${formData.role}.`,
      });
      
      setFormData(initialFormData); // Reset form
      setIsAddUserOpen(false);
    } catch (error: any) {
      toast({
        title: "Error creating user",
        description: error.message || "Failed to create user",
        variant: "destructive",
      });
    }
  };

  const handleEditUser = async () => {
    if (!selectedUser) return;
    try {
      const updatedProfile: UserProfile = {
        ...selectedUser,
        name: formData.name,
        email: formData.email,
        role: formData.role,
        assignedLocations: formData.assignedLocations,
        assignedCompanies: formData.assignedCompanies,
        companyId: formData.role === "client" ? formData.companyId : undefined,
      };
      
      await updateUser(updatedProfile);
      
      toast({
        title: "User updated",
        description: `${formData.name}'s information has been updated.`,
      });
      
      setSelectedUser(null);
      setIsEditUserOpen(false);
    } catch (error: any) {
        toast({
            title: "Error updating user",
            description: error.message || "Failed to update user",
            variant: "destructive",
        });
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    
    try {
        await deleteUser(selectedUser.id);
        toast({
            title: "User deleted",
            description: `${selectedUser.name} has been removed.`,
        });
        setSelectedUser(null);
        setIsDeleteDialogOpen(false);
    } catch (error: any) {
        toast({
            title: "Error deleting user",
            description: error.message || "Failed to delete user",
            variant: "destructive",
        });
    }
  };

  const openEditDialog = (user: UserProfile) => {
    setSelectedUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      role: user.role,
      assignedLocations: user.assignedLocations || [],
      assignedCompanies: user.assignedCompanies || [],
      companyId: user.companyId || "",
      password: "" // Password field should be empty for security
    });
    setIsEditUserOpen(true);
  };

  const openDeleteDialog = (user: UserProfile) => {
    setSelectedUser(user);
    setIsDeleteDialogOpen(true);
  };

  return (
    <AppLayout>
        {/* The JSX from your file seems okay, so I am keeping it as is. The main issues were in the logic. */}
        {/* I've only made minor changes like fixing handler names and ensuring variables exist. */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
            <p className="text-muted-foreground">Manage users and their permissions</p>
          </div>
          <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setFormData(initialFormData)}>Add User</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add New User</DialogTitle>
                <DialogDescription>
                  Create a new user account and assign permissions.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                  {/* Form fields for Add User */}
                  <div className="grid grid-cols-4 items-center gap-4">
                    <label htmlFor="name" className="text-right text-sm">Name</label>
                    <Input id="name" name="name" value={formData.name} onChange={handleInputChange} className="col-span-3" />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <label htmlFor="email" className="text-right text-sm">Email</label>
                    <Input id="email" type="email" name="email" value={formData.email} onChange={handleInputChange} className="col-span-3" />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <label htmlFor="password" className="text-right text-sm">Password</label>
                    <Input id="password" name="password" type="password" value={formData.password} onChange={handleInputChange} className="col-span-3" />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <label className="text-right text-sm">Role</label>
                    <Select value={formData.role} onValueChange={handleRoleChange}>
                      <SelectTrigger className="col-span-3">
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="auditor">Auditor</SelectItem>
                        <SelectItem value="client">Client</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {/*FIX: Check if companies exists before mapping*/}
                  {(formData.role === "auditor" || formData.role === "client") && companies && (
                    <div className="grid grid-cols-4 gap-4">
                        <label className="text-right text-sm">Companies</label>
                        <div className="col-span-3 space-y-2">
                            {companies.map(company => (
                                <div key={company.id} className="flex items-center space-x-2">
                                    <Checkbox id={`company-${company.id}`} checked={formData.assignedCompanies.includes(company.id)} onCheckedChange={() => handleCompanyToggle(company.id)} />
                                    <label htmlFor={`company-${company.id}`} className="text-sm">{company.name}</label>
                                </div>
                            ))}
                        </div>
                    </div>
                  )}
                  {/*FIX: Check if locations exists before mapping*/}
                  {(formData.role === "auditor" || formData.role === "client") && locations && (
                     <div className="grid grid-cols-4 gap-4">
                        <label className="text-right text-sm">Locations</label>
                        <div className="col-span-3 space-y-2">
                            {locations.map(location => (
                                <div key={location.id} className="flex items-center space-x-2">
                                    <Checkbox id={`location-${location.id}`} checked={formData.assignedLocations.includes(location.id)} onCheckedChange={() => handleLocationToggle(location.id)} />
                                    <label htmlFor={`location-${location.id}`} className="text-sm">{location.name}</label>
                                </div>
                            ))}
                        </div>
                    </div>
                  )}
              </div>
              <DialogFooter>
                <Button onClick={handleAddUser}>Add User</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
            {/* Stat Cards */}
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><UserRound className="h-4 w-4" /><span>Admins</span></CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{users.filter(user => user.role === 'admin').length}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Users className="h-4 w-4" /><span>Auditors</span></CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{users.filter(user => user.role === 'auditor').length}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Building className="h-4 w-4" /><span>Clients</span></CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{users.filter(user => user.role === 'client').length}</div></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle>User Accounts</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Assigned Locations</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell><Badge variant={user.role === 'admin' ? 'default' : user.role === 'auditor' ? 'secondary' : 'outline'}>{user.role}</Badge></TableCell>
                    <TableCell>
                      {user.assignedLocations && user.assignedLocations.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {user.assignedLocations.map(locId => {
                            const location = locations.find(l => l.id === locId);
                            return location ? <Badge variant="outline" key={locId}>{location.name}</Badge> : null;
                          })}
                        </div>
                      ) : ( user.role === 'admin' ? <span className="text-xs text-muted-foreground">All locations</span> : <span className="text-xs text-muted-foreground">None assigned</span>)}
                    </TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(user)} disabled={user.id === currentUser?.id}><Edit className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => openDeleteDialog(user)} disabled={user.id === currentUser?.id}><Trash className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Edit User Dialog */}
      <Dialog open={isEditUserOpen} onOpenChange={setIsEditUserOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update user information and permissions.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
             {/* Form fields for Edit User */}
             <div className="grid grid-cols-4 items-center gap-4">
                <label htmlFor="edit-name" className="text-right text-sm">Name</label>
                <Input id="edit-name" name="name" value={formData.name} onChange={handleInputChange} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
                <label htmlFor="edit-email" className="text-right text-sm">Email</label>
                <Input id="edit-email" type="email" name="email" value={formData.email} onChange={handleInputChange} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
                <label className="text-right text-sm">Role</label>
                <Select value={formData.role} onValueChange={handleRoleChange}>
                    <SelectTrigger className="col-span-3"><SelectValue placeholder="Select role" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="auditor">Auditor</SelectItem>
                        <SelectItem value="client">Client</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            {(formData.role === "auditor" || formData.role === "client") && companies && (
                <div className="grid grid-cols-4 gap-4">
                    <label className="text-right text-sm">Companies</label>
                    <div className="col-span-3 space-y-2">
                        {companies.map(company => (
                            <div key={company.id} className="flex items-center space-x-2">
                                <Checkbox id={`edit-company-${company.id}`} checked={formData.assignedCompanies.includes(company.id)} onCheckedChange={() => handleCompanyToggle(company.id)} />
                                <label htmlFor={`edit-company-${company.id}`} className="text-sm">{company.name}</label>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {(formData.role === "auditor" || formData.role === "client") && locations && (
                <div className="grid grid-cols-4 gap-4">
                    <label className="text-right text-sm">Locations</label>
                    <div className="col-span-3 space-y-2">
                        {locations.map(location => (
                            <div key={location.id} className="flex items-center space-x-2">
                                <Checkbox id={`edit-location-${location.id}`} checked={formData.assignedLocations.includes(location.id)} onCheckedChange={() => handleLocationToggle(location.id)} />
                                <label htmlFor={`edit-location-${location.id}`} className="text-sm">{location.name}</label>
                            </div>
                        ))}
                    </div>
                </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleEditUser}>Update User</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this user? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteUser}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default UserManagement;

