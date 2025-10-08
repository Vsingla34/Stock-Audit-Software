
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Check, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Location } from "@/context/InventoryContext";
import { toast } from "sonner";
import { isLocationNameDuplicate } from "./utils/locationUtils";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Company {
  id: string;
  name: string;
}

interface LocationFormProps {
  locations: Location[];
  onSave: (location: Omit<Location, 'id'>) => void;
  onCancel: () => void;
}

export const LocationForm = ({ locations, onSave, onCancel }: LocationFormProps) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [newLocation, setNewLocation] = useState<Omit<Location, 'id'>>({
    name: "",
    description: "",
    active: true,
    companyId: ""
  });

  useEffect(() => {
    loadCompanies();
  }, []);

  const loadCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name')
        .eq('active', true)
        .order('name');

      if (error) throw error;
      setCompanies(data || []);
    } catch (error) {
      console.error('Error loading companies:', error);
    }
  };

  const handleSave = () => {
    if (!newLocation.name.trim()) {
      toast.error("Location name is required");
      return;
    }

    // Check for duplicate names
    if (isLocationNameDuplicate(locations, newLocation.name)) {
      toast.error("A location with this name already exists");
      return;
    }

    try {
      onSave(newLocation);
      toast.success("Location added successfully");
    } catch (error) {
      toast.error("Failed to add location");
    }
  };

  return (
    <Card className="mb-6 border border-dashed">
      <CardContent className="pt-6">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Location Name*</label>
            <Input 
              value={newLocation.name}
              onChange={(e) => setNewLocation(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Enter location name"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Description</label>
            <Textarea
              value={newLocation.description || ''}
              onChange={(e) => setNewLocation(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Optional description"
              rows={2}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Company</label>
            <Select
              value={newLocation.companyId}
              onValueChange={(value) => setNewLocation(prev => ({ ...prev, companyId: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a company" />
              </SelectTrigger>
              <SelectContent>
                {companies.map(company => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Active</label>
            <Switch
              checked={newLocation.active}
              onCheckedChange={(checked) => setNewLocation(prev => ({ ...prev, active: checked }))}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onCancel}
            >
              <X className="mr-1 h-4 w-4" />
              Cancel
            </Button>
            <Button 
              size="sm"
              onClick={handleSave}
            >
              <Check className="mr-1 h-4 w-4" />
              Save
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
