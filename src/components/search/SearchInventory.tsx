import { useState, useEffect } from "react";
import { useInventory, InventoryItem } from "@/context/InventoryContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Plus, Minus } from "lucide-react";
import { toast } from "sonner";
import { useUserAccess } from "@/hooks/useUserAccess";
import { useUser } from "@/context/UserContext";

export const SearchInventory = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<InventoryItem[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const { accessibleLocations } = useUserAccess();
  const { currentUser } = useUser();
  
  const { searchItem, addItemToAudit } = useInventory();

  const userLocations = accessibleLocations();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (searchQuery.length >= 2) {'\''
      const results = searchItem(searchQuery);
      
      // Filter results based on user role and accessible locations
      let filteredResults = results;
      
      if (currentUser?.role !== "admin") {
        // For non-admin users, filter by their accessible locations
        const accessibleLocationNames = userLocations.map(loc => loc.name);
        filteredResults = results.filter(item => 
          accessibleLocationNames.includes(item.location)
        );
      }
      
      setSearchResults(filteredResults);
      
      // Initialize quantities for new search results
      const newQuantities: Record<string, number> = {};
      filteredResults.forEach(item => {
        newQuantities[`${item.id}-${item.location}`] = quantities[`${item.id}-${item.location}`] || 0;
      });
      setQuantities(newQuantities);
    }
  };

  const getItemKey = (item: InventoryItem) => `${item.id}-${item.location}`;

  const incrementQuantity = (item: InventoryItem) => {
    const itemKey = getItemKey(item);
    setQuantities(prev => ({
      ...prev,
      [itemKey]: (prev[itemKey] || 0) + 1
    }));
  };

  const decrementQuantity = (item: InventoryItem) => {
    const itemKey = getItemKey(item);
    if (quantities[itemKey] > 0) {
      setQuantities(prev => ({
        ...prev,
        [itemKey]: prev[itemKey] - 1
      }));
    }
  };

  const handleAddToAudit = (item: InventoryItem) => {
    const itemKey = getItemKey(item);
    const quantity = quantities[itemKey] || 0;
    addItemToAudit(item, quantity);
    toast.success("Item added to audit", {
      description: `Added ${quantity} of ${item.name} at ${item.location}`
    });
  };

  // Clear search when user doesn't have access to any locations
  useEffect(() => {
    if (currentUser?.role !== "admin" && userLocations.length === 0) {
      setSearchResults([]);
      setSearchQuery("");
    }
  }, [currentUser, userLocations]);

  if (currentUser?.role !== "admin" && userLocations.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            <span>Search Inventory</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center p-8 text-muted-foreground">
            <h3 className="text-lg font-semibold mb-2">No Access</h3>
            <p>You don't have access to any locations for searching inventory.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          <span>Search Inventory</span>
          {currentUser?.role !== "admin" && userLocations.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground ml-2">
              (Limited to: {userLocations.map(loc => loc.name).join(", ")})
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSearch} className="flex gap-2 mb-6">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, SKU, or ID..."
            className="flex-1"
          />
          <Button type="submit">Search</Button>
        </form>

        {searchResults.length > 0 ? (
          <div className="border rounded-md">
            <div className="grid grid-cols-[1fr_auto] gap-4 p-4 font-medium border-b">
              <div>Item Details</div>
              <div className="text-right">Quantity</div>
            </div>
            {searchResults.map((item) => {
              const itemKey = getItemKey(item);
              return (
                <div key={itemKey} className="grid grid-cols-[1fr_auto] gap-4 p-4 border-b last:border-0">
                  <div>
                    <h3 className="font-medium">{item.name}</h3>
                    <div className="text-sm text-muted-foreground">SKU: {item.sku}</div>
                    <div className="text-sm text-muted-foreground">Location: {item.location}</div>
                    <div className="text-sm">System Quantity: {item.systemQuantity}</div>
                  </div>
                  <div className="flex flex-col items-end">
                    <div className="flex items-center space-x-2 mb-2">
                      <Button 
                        variant="outline" 
                        size="icon" 
                        className="h-8 w-8"
                        onClick={() => decrementQuantity(item)}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="w-8 text-center font-medium">
                        {quantities[itemKey] || 0}
                      </span>
                      <Button 
                        variant="outline" 
                        size="icon" 
                        className="h-8 w-8"
                        onClick={() => incrementQuantity(item)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <Button 
                      variant="secondary"
                      size="sm"
                      onClick={() => handleAddToAudit(item)}
                      disabled={!(quantities[itemKey] > 0)}
                    >
                      Add to Audit
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : searchQuery.length >= 2 ? (
          <div className="text-center p-8 text-muted-foreground">
            No results found for "{searchQuery}"
            {currentUser?.role !== "admin" && (
              <div className="text-sm mt-1">
                (Search limited to your assigned locations)
              </div>
            )}
          </div>
        ) : (
          <div className="text-center p-8 text-muted-foreground">
            Enter at least 2 characters to search
            {currentUser?.role !== "admin" && userLocations.length > 0 && (
              <div className="text-sm mt-2">
                You can search items from: {userLocations.map(loc => loc.name).join(", ")}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};