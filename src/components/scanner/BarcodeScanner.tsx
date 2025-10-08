// Final BarcodeScanner.tsx with FOCUS EXCLUSION FIX (Allows hardware scanner input to receive focus without blocking logic)

import React, { useState, useRef, useEffect } from "react";
import { useInventory, InventoryItem } from "@/context/InventoryContext"; 
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Barcode, Scan, Check, MapPin, Keyboard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Html5QrcodeScanner, Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { useUser } from "@/context/UserContext"; 
import { useUserAccess } from "@/hooks/useUserAccess";

export const BarcodeScanner = () => {
    const [isScanning, setIsScanning] = useState(false);
    const [isHardwareScannerMode, setIsHardwareScannerMode] = useState(false);
    const [manualBarcode, setManualBarcode] = useState("");
    const [selectedLocation, setSelectedLocation] = useState(""); 
    const [scannedBarcode, setScannedBarcode] = useState(""); 
    
    const { itemMaster, auditedItems, updateAuditedItem, locations } = useInventory();
    const { accessibleLocations } = useUserAccess();
    const { currentUser } = useUser();
    const userAccessibleLocations = accessibleLocations();
    
    const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
    const hardwareScannerInputRef = useRef<HTMLInputElement>(null);
    const scannerElementId = "barcode-scanner-element";

    const scannedBufferRef = useRef('');

    // Function to handle item scanning with quantity increment logic (unchanged)
    const handleItemScan = async (barcode: string, locationId: string): Promise<boolean> => {
        
        if (typeof updateAuditedItem !== 'function') {
            console.error("updateAuditedItem is not available in InventoryContext.");
            toast.error("System Error", {
                description: "Inventory update function missing.",
            });
            return false;
        }

        try {
            // 1. ROBUST LOCATION VALIDATION AND NAME RETRIEVAL
            let locationName = '';
            
            if (!locationId || locationId === "") {
                 toast.error("Location Required", {
                   description: "Please select a location from the dropdown before scanning.",
                 });
                 return false; 
            }
            
            // Convert ID to NAME
            const locationObj = locations.find(loc => loc.id === locationId);
            locationName = locationObj?.name || '';
            
            if (locationName === '') {
                 toast.error("Invalid Location", {
                   description: "The selected location ID could not be matched to a location name.",
                 });
                 return false;
            }
            
            // Find the item in master data - search by barcode first
            const masterItem = itemMaster.find(item => 
                (item.id === barcode || item.sku === barcode)
            );
            
            if (!masterItem) {
                toast.error("Item not found", {
                    description: `No item found with barcode ${barcode} in master data.`,
                });
                return false;
            }

            // 2. Location Correction Logic (Uses locationName, not ID)
            if (masterItem.location !== locationName) {
                if (currentUser?.role === "admin") {
                    toast.warning("Location mismatch", {
                        description: `Item belongs to ${masterItem.location}. Proceeding with item's actual location.`,
                    });
                    locationName = masterItem.location;
                } else {
                    const itemLocationAccess = userAccessibleLocations.find(loc => loc.name === masterItem.location);
                    if (!itemLocationAccess) {
                        toast.error("Access denied", {
                            description: `Item belongs to ${masterItem.location} which you don't have access to`,
                        });
                        return false;
                    } else {
                        toast.warning("Location corrected", {
                            description: `Item belongs to ${masterItem.location}, updating location`,
                        });
                        locationName = masterItem.location;
                    }
                }
            } 
            
            // 3. Quantity and Status Calculation
            const existingAuditedItem = auditedItems.find(
                item => item.sku === masterItem.sku && item.location === locationName
            );

            let initialPhysicalQuantity = existingAuditedItem?.physicalQuantity || 0;
            let newPhysicalQuantity = initialPhysicalQuantity + 1;
            
            const status = newPhysicalQuantity === masterItem.systemQuantity ? 'matched' : 'discrepancy';

            // 4. Construct Item to Update
            const itemToUpdate: InventoryItem = {
                id: masterItem.id,
                sku: masterItem.sku,
                name: masterItem.name,
                category: masterItem.category,
                location: locationName, 
                systemQuantity: masterItem.systemQuantity,
                physicalQuantity: newPhysicalQuantity,
                status: status,
                lastAudited: new Date().toISOString(),
                notes: existingAuditedItem?.notes || masterItem.notes,
            };

            // 5. Persistence
            await updateAuditedItem(itemToUpdate); 

            // 6. Success Toast
            const quantityInfo = initialPhysicalQuantity > 0 
                ? `(${initialPhysicalQuantity} → ${newPhysicalQuantity})`
                : `(Physical: ${newPhysicalQuantity}, System: ${masterItem.systemQuantity})`;

            if (status === "matched") {
                toast.success("Item scanned - Matched!", {
                    description: `${masterItem.name} ${quantityInfo} at ${locationName}`,
                });
            } else {
                toast.warning("Item scanned - Discrepancy detected!", {
                    description: `${masterItem.name} ${quantityInfo} at ${locationName}`,
                });
            }

            return true;
        } catch (error: any) {
            console.error("Scanning failed due to unhandled error:", error);
            toast.error("Scanning Error", {
                description: error.message || "Failed to process the scanned item",
            });
            return false;
        }
    };


    useEffect(() => {
        const handleKeyPress = (event: KeyboardEvent) => {
            const activeElement = document.activeElement as HTMLElement;
            
            // 🌟 FIX APPLIED HERE: Exclude the hidden input field from the focus check.
            // This allows the hidden input to receive the keystrokes without blocking the logic.
            const isInputFocused = activeElement && 
                                   (activeElement !== hardwareScannerInputRef.current) &&
                                   (activeElement.tagName === 'INPUT' || 
                                    activeElement.tagName === 'TEXTAREA' ||
                                    activeElement.getAttribute('role') === 'textbox');
            
            // --- DEBUGGING LOGS ---
            console.log(`Key Pressed: ${event.key}, isFocused: ${isInputFocused}`); 
            console.log(`Guard Check -> Mode: ${isHardwareScannerMode}, Location: ${!!selectedLocation}, Focused: ${isInputFocused}`); 
            
            // Guard clause for silent failure (now relies on isInputFocused being false for non-scanner inputs)
            if (!isHardwareScannerMode || !selectedLocation || isInputFocused) {
                 if (event.key.length > 1 && event.key !== 'Shift' && event.key !== 'Control' && event.key !== 'Alt') { 
                     console.warn("Hardware Scan prevented by guard clause.");
                 }
                 return;
            }
            
            if (event.key === 'Enter') {
                event.preventDefault();
                
               
                console.log("Raw Buffer on Enter:", scannedBufferRef.current); 

                if (scannedBufferRef.current.trim()) {
                    const barcodeToScan = scannedBufferRef.current.trim();

                    
                    handleItemScan(barcodeToScan, selectedLocation)
                        .then(success => {
                            if (success) {
                                setScannedBarcode(barcodeToScan);
                            }
                        })
                        .catch(e => console.error("Hardware scan handler error:", e));

                    scannedBufferRef.current = ""; 
                } else {
                    console.warn("Buffer was empty, scan ignored.");
                }
                return;
            }

            if (event.key.length === 1) {
                scannedBufferRef.current += event.key;
            }
        };

        if (isHardwareScannerMode) {
            window.addEventListener('keydown', handleKeyPress);
           
            hardwareScannerInputRef.current?.focus(); 
        }

        return () => {
            window.removeEventListener('keydown', handleKeyPress);
        };
    }, [isHardwareScannerMode, selectedLocation, itemMaster, auditedItems, locations, currentUser, updateAuditedItem, userAccessibleLocations]);

// ---------------------------------------------------------------------
// END HARDWARE SCANNER LISTENER
// ---------------------------------------------------------------------

    // Clear buffer after a delay (unchanged)
    useEffect(() => {
        if (isHardwareScannerMode) {
            const timeout = setTimeout(() => {
                if (scannedBufferRef.current.length > 0) {
                     scannedBufferRef.current = "";
                     console.log("Scanner buffer cleared due to timeout.");
                }
            }, 500); 

            return () => clearTimeout(timeout);
        }
    }, [scannedBarcode, isHardwareScannerMode]);

    // Cleanup scanner on component unmount (unchanged)
    useEffect(() => {
        return () => {
            if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
                html5QrCodeRef.current.stop().catch(console.error);
            }
        };
    }, []);

    const onScanSuccess = (decodedText: string, decodedResult: any) => {
        
        
        handleItemScan(decodedText, selectedLocation)
            .then(success => {
                if (success) {
                    setScannedBarcode(decodedText);
                }
            })
            .catch(e => console.error("Camera scan handler error:", e));
    };

    const onScanError = (errorMessage: string) => {
        console.debug("Scan error:", errorMessage);
    };

    // handleStartHardwareScanner function now includes the fix to blur other elements
    const handleStartHardwareScanner = () => {
        if (!selectedLocation) {
            toast.error("Location required", {
                description: "Please select a specific location before scanning."
            });
            return;
        }

        setIsHardwareScannerMode(true);
        toast.success("Hardware scanner activated", {
            description: "Scan items with your barcode scanner. Press ESC to stop."
        });
        
        // **FIX: Blur any currently focused element**
        (document.activeElement as HTMLElement)?.blur(); 
        
        setTimeout(() => {
            // Attempt to focus the hidden input to capture input directly
            hardwareScannerInputRef.current?.focus(); 
        }, 100);
    };

    const handleStopHardwareScanner = () => {
        setIsHardwareScannerMode(false);
        scannedBufferRef.current = ""; // Clear the buffer
        hardwareScannerInputRef.current?.blur();
        toast.info("Hardware scanner stopped");
    };

    const handleStartScanning = async () => {
        if (!selectedLocation) {
            toast.error("Location required", {
                description: "Please select a specific location before scanning."
            });
            return;
        }

        const config = {
            fps: 10,
            qrbox: { width: 250, height: 250 }, 
            aspectRatio: 1.777778, 
            formatsToSupport: [
                Html5QrcodeSupportedFormats.QR_CODE,
                Html5QrcodeSupportedFormats.CODE_128,
                Html5QrcodeSupportedFormats.CODE_39,
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.EAN_8,
                Html5QrcodeSupportedFormats.UPC_A,
                Html5QrcodeSupportedFormats.UPC_E,
            ]
        };

        try {
            html5QrCodeRef.current = new Html5Qrcode(scannerElementId);

            await html5QrCodeRef.current.start(
                { facingMode: "environment" },
                config,
                onScanSuccess,
                onScanError
            );

            setIsScanning(true);
            toast.success("Camera scanner started", {
                description: "Point the camera at a barcode or QR code to scan."
            });

        } catch (err: any) {
            console.error("Error starting scanner:", err);
            
            try {
                if (!html5QrCodeRef.current) {
                    html5QrCodeRef.current = new Html5Qrcode(scannerElementId);
                }
                
                // Fallback to user-facing camera
                await html5QrCodeRef.current.start(
                    { facingMode: "user" },
                    config,
                    onScanSuccess,
                    onScanError
                );
                setIsScanning(true);
                toast.success("Camera scanner started", {
                    description: "Using front camera. Point at a barcode or QR code to scan."
                });
            } catch (fallbackErr: any) {
                toast.error("Camera not available", {
                    description: "Try using hardware scanner mode or manual entry instead."
                });
                console.error("Fallback camera error:", fallbackErr);
                html5QrCodeRef.current = null;
            }
        }
    };

    const handleStopScanning = async () => {
        try {
            if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
                await html5QrCodeRef.current.stop();
                html5QrCodeRef.current.clear();
            }
            setIsScanning(false);
            toast.info("Camera scanner stopped");
        } catch (err) {
            console.error("Error stopping scanner:", err);
            setIsScanning(false);
        }
    };

    const handleManualSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedLocation) {
            toast.error("Location required", {
                description: "Please select a location before submitting."
            });
            return;
        }
        
        if (manualBarcode.trim()) {
            handleItemScan(manualBarcode.trim(), selectedLocation)
                .then(success => {
                    if (success) {
                        setScannedBarcode(manualBarcode.trim());
                        setManualBarcode("");
                    }
                })
                .catch(e => console.error("Manual submit handler error:", e));
        }
    };

    // Handle ESC key to stop hardware scanner (unchanged)
    useEffect(() => {
        const handleEscKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && isHardwareScannerMode) {
                handleStopHardwareScanner();
            }
        };

        if (isHardwareScannerMode) {
            window.addEventListener('keydown', handleEscKey);
        }

        return () => {
            window.removeEventListener('keydown', handleEscKey);
        };
    }, [isHardwareScannerMode]);

    return (
        <div className="grid md:grid-cols-2 gap-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Barcode className="h-5 w-5" />
                        <span>Barcode Scanner</span>
                        {currentUser?.role === "admin" && (
                            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full ml-2">
                                Admin Mode
                            </span>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                                <SelectTrigger className="flex-1">
                                    <SelectValue placeholder="Select location" />
                                </SelectTrigger>
                                <SelectContent>
                                    {currentUser?.role === "admin" ? (
                                    <>
                                        <SelectItem value="" disabled>Select a location to audit</SelectItem>
                                        {locations.map((location) => (
                                            <SelectItem key={location.id} value={location.id}>
                                                {location.name}
                                            </SelectItem>
                                        ))}
                                    </>
                                    ) : (
                                    userAccessibleLocations.length > 0 ? (
                                        userAccessibleLocations.map((location) => (
                                            <SelectItem key={location.id} value={location.id}>
                                                {location.name}
                                            </SelectItem>
                                        ))
                                    ) : (
                                        <SelectItem value="no-locations" disabled>
                                            No assigned locations
                                        </SelectItem>
                                    )
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                        
                        {selectedLocation && (
                            <div className="text-sm text-muted-foreground bg-gray-50 p-2 rounded">
                                <strong>Selected:</strong> {locations.find(l => l.id === selectedLocation)?.name || 'Error: Location Name Not Found'}
                            </div>
                        )}
                        
                        {/* Hardware Scanner Mode */}
                        {isHardwareScannerMode ? (
                            <div>
                                <div className="w-full aspect-video relative bg-blue-50 rounded-lg overflow-hidden mb-4 flex items-center justify-center border-2 border-blue-200 border-dashed">
                                    <div className="text-center">
                                        <Keyboard className="h-12 w-12 text-blue-500 mx-auto mb-2" />
                                        <p className="text-blue-700 font-medium">Hardware Scanner Active</p>
                                        <p className="text-sm text-blue-600">Scan items with your barcode scanner</p>
                                        {scannedBarcode && (
                                            <p className="text-xs text-blue-500 mt-2 font-mono bg-blue-100 px-2 py-1 rounded">
                                                Last: {scannedBarcode}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <Button 
                                    variant="destructive" 
                                    className="w-full" 
                                    onClick={handleStopHardwareScanner}
                                >
                                    Stop Hardware Scanner (ESC)
                                </Button>
                            </div>
                        ) : isScanning ? (
                            <div>
                                <div className="w-full aspect-video relative rounded-lg overflow-hidden mb-4 border">
                                    <div id={scannerElementId} className="w-full h-full" />
                                </div>
                                <Button 
                                    variant="destructive" 
                                    className="w-full" 
                                    onClick={handleStopScanning}
                                >
                                    Stop Camera Scanning
                                </Button>
                            </div>
                        ) : (
                            <div>
                                <div className="w-full aspect-video relative bg-gray-100 rounded-lg overflow-hidden mb-4 flex items-center justify-center">
                                    <p className="text-center text-muted-foreground">
                                        Camera preview will appear here when scanning
                                    </p>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-2">
                                    <Button 
                                        variant="default" 
                                        className="w-full" 
                                        onClick={handleStartScanning}
                                        disabled={!selectedLocation}
                                    >
                                        <Scan className="mr-2 h-4 w-4" />
                                        Camera Scan
                                    </Button>
                                    <Button 
                                        variant="secondary" 
                                        className="w-full" 
                                        onClick={handleStartHardwareScanner}
                                        disabled={!selectedLocation}
                                    >
                                        <Keyboard className="mr-2 h-4 w-4" />
                                        Hardware Scan
                                    </Button>
                                </div>
                            </div>
                        )}
                        
                        {/* Manual Entry */}
                        <div className="border-t pt-4">
                            <form onSubmit={handleManualSubmit} className="flex gap-2">
                                <Input
                                    placeholder="Enter barcode manually"
                                    value={manualBarcode}
                                    onChange={(e) => setManualBarcode(e.target.value)}
                                    disabled={!selectedLocation}
                                />
                                <Button type="submit" disabled={!selectedLocation || !manualBarcode.trim()}>
                                    <Check className="h-4 w-4" />
                                </Button>
                            </form>
                        </div>
                        
                        {/* Hidden input to capture hardware scanner input */}
                        <input
                            ref={hardwareScannerInputRef}
                            type="text"
                            style={{ position: 'absolute', left: '-9999px', opacity: 0 }}
                            tabIndex={-1}
                            autoComplete="off"
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Scanning Instructions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <h3 className="font-medium mb-1">Camera Scanning:</h3>
                        <ol className="list-decimal list-inside space-y-1 text-sm">
                            <li>Select a **specific location** from the dropdown</li>
                            <li>Click "Camera Scan" to activate the barcode scanner</li>
                            <li>Point the camera at the barcode on the item</li>
                            <li>Hold steady until the barcode is recognized</li>
                        </ol>
                    </div>
                    
                    <div>
                        <h3 className="font-medium mb-1">Hardware Scanner:</h3>
                        <ol className="list-decimal list-inside space-y-1 text-sm">
                            <li>Connect your USB barcode scanner to the computer</li>
                            <li>Select a **specific location** from the dropdown</li>
                            <li>Click "Hardware Scan" to activate scanner mode</li>
                            <li>The app automatically manages focus now.</li>
                            <li>Scan items with your hardware scanner</li>
                            <li>Press ESC to stop scanning</li>
                        </ol>
                    </div>

                    <div>
                        <h3 className="font-medium mb-1">Status Updates:</h3>
                        <ul className="list-disc list-inside space-y-1 text-sm">
                            <li><span className="text-green-600">Matched</span> - Physical qty equals system qty</li>
                            <li><span className="text-red-600">Discrepancy</span> - Physical qty differs from system qty</li>
                            <li>Multiple scans of same item **increment physical quantity by 1**</li>
                        </ul>
                    </div>
                    
                    <div>
                        <h3 className="font-medium">Supported formats:</h3>
                        <p className="text-sm text-muted-foreground">
                            QR Code, CODE128, CODE39, UPC-A, UPC-E, EAN-13, EAN-8
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};