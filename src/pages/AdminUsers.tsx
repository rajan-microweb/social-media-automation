import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { format } from "date-fns";

interface User {
  id: string;
  name: string;
  email: string;
  created_at: string;
  roles: string[];
}

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (profilesError) {
      toast.error("Failed to load users");
      setLoading(false);
      return;
    }

    const usersWithRoles = await Promise.all(
      profiles.map(async (profile) => {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", profile.id);

        return {
          ...profile,
          roles: roles?.map((r) => r.role) || [],
        };
      })
    );

    setUsers(usersWithRoles);
    setLoading(false);
  };

  const { user: currentUser } = useAuth();

  const toggleAdmin = async (userId: string, currentRoles: string[]) => {
    const isAdmin = currentRoles.includes("ADMIN");

    // Block admin from removing their own admin role
    if (isAdmin && userId === currentUser?.id) {
      toast.error("You cannot remove your own admin role");
      return;
    }

    if (isAdmin) {
      // Remove admin role
      const { error: deleteError } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", "ADMIN");

      if (deleteError) {
        toast.error("Failed to remove admin role");
        return;
      }

      // Auto-add CLIENT role if user doesn't have it
      if (!currentRoles.includes("CLIENT")) {
        const { error: insertError } = await supabase
          .from("user_roles")
          .insert({ user_id: userId, role: "CLIENT" });

        if (insertError) {
          toast.error("Failed to add client role");
          return;
        }
      }

      toast.success("Admin role removed, user is now a client");
      fetchUsers();
    } else {
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role: "ADMIN" });

      if (error) {
        toast.error("Failed to add admin role");
      } else {
        toast.success("Admin role granted");
        fetchUsers();
      }
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground">Manage user roles and permissions</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Users</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">Loading...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.name}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {user.roles.map((role) => (
                            <Badge
                              key={role}
                              variant={role === "ADMIN" ? "default" : "secondary"}
                            >
                              {role}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        {format(new Date(user.created_at), "PP")}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant={
                            user.roles.includes("ADMIN") ? "destructive" : "default"
                          }
                          onClick={() => toggleAdmin(user.id, user.roles)}
                          disabled={user.roles.includes("ADMIN") && user.id === currentUser?.id}
                        >
                          {user.roles.includes("ADMIN")
                            ? "Remove Admin"
                            : "Make Admin"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
