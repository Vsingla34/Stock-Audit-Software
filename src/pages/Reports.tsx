import { AppLayout } from "@/components/layout/AppLayout";
import { useInventory } from "@/context/InventoryContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileText, FileType, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import { autoTable } from "jspdf-autotable";
import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { useUser } from "@/context/UserContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUserAccess } from "@/hooks/useUserAccess";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

declare module "jspdf" {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

const Reports = () => {
  const {
    auditedItems, 
    itemMaster, 
    getInventorySummary, 
    getLocationSummary, 
    locations,
    getLocationQuestionnaireAnswers,
    getQuestionById
  } = useInventory();
  const { currentUser } = useUser();
  const { accessibleLocations, userRole } = useUserAccess();
  const reportRef = useRef(null);
  
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [hasInitialized, setHasInitialized] = useState(false);
  
  const userLocations = useMemo(() => accessibleLocations(), [accessibleLocations]);
  
  // Memoized filtered data
  const { filteredAuditedItems, filteredItemMaster, summary } = useMemo(() => {
    if (currentUser?.role === "admin" && !selectedLocation) {
      return {
        filteredAuditedItems: auditedItems,
        filteredItemMaster: itemMaster,
        summary: getInventorySummary()
      };
    } else if (selectedLocation) {
      const locationObj = locations.find(loc => loc.id === selectedLocation);
      if (locationObj) {
        const locationName = locationObj.name;
        return {
          filteredAuditedItems: auditedItems.filter(item => item.location === locationName),
          filteredItemMaster: itemMaster.filter(item => item.location === locationName),
          summary: getLocationSummary(locationName)
        };
      }
    }
    
    return {
      filteredAuditedItems: currentUser?.role === "admin" ? auditedItems : [],
      filteredItemMaster: currentUser?.role === "admin" ? itemMaster : [],
      summary: currentUser?.role === "admin" ? getInventorySummary() : { totalItems: 0, auditedItems: 0, matched: 0, discrepancies: 0, pendingItems: 0 }
    };
  }, [selectedLocation, auditedItems, itemMaster, locations, currentUser?.role, getInventorySummary, getLocationSummary]);
  
  // Initialize location for non-admin users
  useEffect(() => {
    if (!hasInitialized && currentUser?.role !== "admin" && userLocations.length > 0) {
      setSelectedLocation(userLocations[0].id);
      setHasInitialized(true);
    }
  }, [currentUser?.role, userLocations, hasInitialized]);

  // Memoized table data
  const tableData = useMemo(() => {
    return filteredItemMaster.map(item => {
      const auditedItem = filteredAuditedItems.find(a => a.id === item.id && a.location === item.location);
      return {
        id: item.id,
        sku: item.sku,
        name: item.name,
        category: item.category,
        location: item.location,
        systemQuantity: item.systemQuantity,
        physicalQuantity: auditedItem?.physicalQuantity || 0,
        variance: auditedItem ? auditedItem.physicalQuantity - item.systemQuantity : -item.systemQuantity,
        status: auditedItem?.status || 'pending',
        lastAudited: auditedItem?.lastAudited || ''
      };
    });
  }, [filteredItemMaster, filteredAuditedItems]);

  const generateCSV = useCallback((data: any[], filename: string) => {
    const headers = Array.from(
      new Set(
        data.flatMap(item => Object.keys(item))
      )
    );

    let csvContent = headers.join(',') + '\n';

    data.forEach(item => {
      const row = headers.map(header => {
        const value = item[header] !== undefined ? String(item[header]) : '';
        return value.includes(',') ? `"${value}"` : value;
      }).join(',');
      csvContent += row + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast.success(`${filename} downloaded`);
  }, []);

  const downloadReconciliationReport = useCallback(() => {
    const reportData = tableData.map(item => ({
      id: item.id,
      sku: item.sku,
      name: item.name,
      category: item.category,
      location: item.location,
      systemQuantity: item.systemQuantity,
      physicalQuantity: item.physicalQuantity,
      variance: item.variance,
      status: item.status,
      lastAudited: item.lastAudited
    }));
    
    const locationInfo = selectedLocation ? 
      `_${locations.find(loc => loc.id === selectedLocation)?.name}` : '';
      
    generateCSV(reportData, `inventory_reconciliation_report${locationInfo}.csv`);
  }, [tableData, selectedLocation, locations, generateCSV]);

  const downloadDiscrepancyReport = useCallback(() => {
    const discrepancies = tableData
      .filter(item => item.variance !== 0)
      .map(item => ({
        id: item.id,
        sku: item.sku,
        name: item.name,
        category: item.category,
        location: item.location,
        systemQuantity: item.systemQuantity,
        physicalQuantity: item.physicalQuantity,
        variance: item.variance,
        lastAudited: item.lastAudited
      }));
    
    const locationInfo = selectedLocation ? 
      `_${locations.find(loc => loc.id === selectedLocation)?.name}` : '';
      
    generateCSV(discrepancies, `discrepancy_report${locationInfo}.csv`);
  }, [tableData, selectedLocation, locations, generateCSV]);

  const downloadSummaryReport = useCallback(() => {
    const summaryData = [
      {
        totalItems: summary.totalItems,
        auditedItems: summary.auditedItems,
        pendingItems: summary.pendingItems,
        matchedItems: summary.matched,
        discrepancies: summary.discrepancies,
        auditCompletionPercentage: summary.totalItems > 0 
          ? Math.round((summary.auditedItems / summary.totalItems) * 100) 
          : 0,
        generatedDate: new Date().toISOString(),
        location: selectedLocation ? 
          locations.find(loc => loc.id === selectedLocation)?.name : 'All Locations'
      }
    ];
    
    const locationInfo = selectedLocation ? 
      `_${locations.find(loc => loc.id === selectedLocation)?.name}` : '';
      
    generateCSV(summaryData, `audit_summary_report${locationInfo}.csv`);
  }, [summary, selectedLocation, locations, generateCSV]);

  const formatQuestionnaireAnswer = useCallback((answer: string | string[], questionType: string) => {
    if (questionType === "yesNo") {
      return answer === "yes" ? "Yes" : "No";
    }
    
    if (Array.isArray(answer)) {
      return answer.join(", ");
    }
    
    return answer;
  }, []);

  const generatePDFReport = useCallback(() => {
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    const reportTitle = selectedLocation 
      ? `Inventory Audit Report - ${locations.find(loc => loc.id === selectedLocation)?.name}`
      : "Inventory Audit Report - All Locations";
    
    doc.text(reportTitle, 14, 22);
    
    doc.setFontSize(11);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30);
    
    doc.setFontSize(14);
    doc.text("Audit Summary", 14, 40);
    
    const summaryTableBody = [
      ["Total Items", summary.totalItems.toString()],
      ["Audited Items", summary.auditedItems.toString()],
      ["Matched Items", summary.matched.toString()],
      ["Discrepancies", summary.discrepancies.toString()],
      ["Completion Rate", `${summary.totalItems > 0 
        ? Math.round((summary.auditedItems / summary.totalItems) * 100) 
        : 0}%`]
    ];
    
    autoTable(doc, {
      startY: 45,
      head: [["Metric", "Value"]],
      body: summaryTableBody,
      theme: 'grid',
      headStyles: { fillColor: [139, 92, 246] }
    });
    
    const finalY = (doc as any)['lastAutoTable'] ? (doc as any)['lastAutoTable'].finalY : 90;
    let currentY = finalY + 10;
    doc.setFontSize(14);
    doc.text("Observations", 14, currentY);
    
    const observations = [];
    
    if (summary.discrepancies > 0) {
      observations.push(`There are ${summary.discrepancies} items with quantity discrepancies.`);
    } else {
      observations.push("All audited items match their expected quantities.");
    }
    
    if (summary.pendingItems > 0) {
      observations.push(`${summary.pendingItems} items (${Math.round((summary.pendingItems / summary.totalItems) * 100)}%) are still pending audit.`);
    } else {
      observations.push("All items have been audited.");
    }
    
    let observationY = currentY + 10;
    observations.forEach(obs => {
      doc.setFontSize(11);
      doc.text(`• ${obs}`, 16, observationY);
      observationY += 7;
    });
    
    const discrepancies = tableData
      .filter(item => item.status === "discrepancy")
      .map(item => [
        item.sku,
        item.name,
        item.location,
        item.systemQuantity.toString(),
        item.physicalQuantity.toString(),
        item.variance.toString()
      ]);
      
    if (discrepancies.length > 0) {
      const discrepancyY = observationY + 10;
      doc.setFontSize(14);
      doc.text("Discrepancy Details", 14, discrepancyY);
      
      autoTable(doc, {
        startY: discrepancyY + 5,
        head: [["SKU", "Name", "Location", "System Qty", "Physical Qty", "Variance"]],
        body: discrepancies,
        theme: 'grid',
        headStyles: { fillColor: [249, 115, 22] },
        styles: { fontSize: 9 }
      });
    }
    
    if (selectedLocation) {
      const answers = getLocationQuestionnaireAnswers(selectedLocation);
      
      if (answers.length > 0) {
        const lastTableY = (doc as any)['lastAutoTable'] 
          ? (doc as any)['lastAutoTable'].finalY + 15 
          : observationY + 15;
        
        doc.setFontSize(14);
        doc.text("Audit Questionnaire Responses", 14, lastTableY);
        
        const answerData = answers.map(answer => {
          const question = getQuestionById(answer.questionId);
          if (!question) return null;
          
          return [
            question.text,
            formatQuestionnaireAnswer(answer.answer, question.type),
            answer.answeredBy || 'N/A',
            new Date(answer.answeredOn).toLocaleDateString()
          ];
        }).filter(Boolean);
        
        if (answerData.length > 0) {
          autoTable(doc, {
            startY: lastTableY + 5,
            head: [["Question", "Response", "Answered By", "Date"]],
            body: answerData,
            theme: 'grid',
            headStyles: { fillColor: [79, 70, 229] },
            styles: { fontSize: 9 },
            columnStyles: {
              0: { cellWidth: 80 },
              1: { cellWidth: 60 },
            }
          });
        }
        
        const lastPos = (doc as any)['lastAutoTable'] ? (doc as any)['lastAutoTable'].finalY + 20 : doc.internal.pageSize.height - 60;
        
        doc.setFontSize(12);
        doc.text("Auditor Sign-off", 14, lastPos);
        
        doc.setFontSize(10);
        doc.text("Name: _________________________", 14, lastPos + 10);
        doc.text("Signature: _____________________", 14, lastPos + 20);
        doc.text("Date: __________________________", 14, lastPos + 30);
        
        doc.text("Client Sign-off", 120, lastPos + 10);
        doc.text("Name: _________________________", 120, lastPos + 20);
        doc.text("Signature: _____________________", 120, lastPos + 30);
      }
    }
    
    const locationInfo = selectedLocation ? 
      `_${locations.find(loc => loc.id === selectedLocation)?.name}` : '';
      
    doc.save(`inventory_audit_report${locationInfo}.pdf`);
    toast.success("PDF Report downloaded");
  }, [selectedLocation, locations, summary, tableData, getLocationQuestionnaireAnswers, getQuestionById, formatQuestionnaireAnswer]);

  return (
    <AppLayout>
      <div>
        {userRole === "admin" || userLocations.length > 0 ? (
          <div className="space-y-6" ref={reportRef}>
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
                <p className="text-muted-foreground">Generate and download inventory audit reports</p>
              </div>
              
              <div className="w-64">
                <Select 
                  value={selectedLocation}
                  onValueChange={setSelectedLocation}
                  disabled={currentUser?.role !== "admin" && userLocations.length <= 1}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={
                      currentUser?.role === "admin" ? 
                        "All Locations" : 
                        userLocations.length ? userLocations.find(loc => loc.id === selectedLocation)?.name || "Select Location" : "No locations"
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    {currentUser?.role === "admin" && (
                      <SelectItem value="">All Locations</SelectItem>
                    )}
                    {userLocations.map(location => (
                      <SelectItem key={location.id} value={location.id}>
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <Card className="bg-gradient-to-br from-indigo-50 to-white">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileSpreadsheet className="h-5 w-5 text-indigo-600" />
                    Reconciliation Report
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Complete report of all inventory items with system vs. physical count reconciliation.
                  </p>
                  <Button 
                    variant="outline" 
                    className="w-full border-indigo-200 hover:bg-indigo-50" 
                    onClick={downloadReconciliationReport}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download CSV
                  </Button>
                </CardContent>
              </Card>
              
              <Card className="bg-gradient-to-br from-orange-50 to-white">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-orange-600" />
                    Discrepancy Report
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Filtered report showing only items with quantity discrepancies.
                  </p>
                  <Button 
                    variant="outline" 
                    className="w-full border-orange-200 hover:bg-orange-50"
                    onClick={downloadDiscrepancyReport}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download CSV
                  </Button>
                </CardContent>
              </Card>
              
              <Card className="bg-gradient-to-br from-green-50 to-white">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-green-600" />
                    Audit Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    High-level summary of the audit with key metrics and findings.
                  </p>
                  <Button 
                    variant="outline" 
                    className="w-full border-green-200 hover:bg-green-50"
                    onClick={downloadSummaryReport}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download CSV
                  </Button>
                </CardContent>
              </Card>
              
              <Card className="bg-gradient-to-br from-purple-50 to-white">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileType className="h-5 w-5 text-purple-600" />
                    Complete PDF Report
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Complete audit report with observations and tables in PDF format.
                  </p>
                  <Button 
                    variant="outline" 
                    className="w-full border-purple-200 hover:bg-purple-50"
                    onClick={generatePDFReport}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download PDF
                  </Button>
                </CardContent>
              </Card>
            </div>
            
            <Card className="bg-white">
              <CardHeader>
                <CardTitle>Audit Statistics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Items</p>
                    <p className="text-2xl font-bold text-gray-800">{summary.totalItems}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Items Audited</p>
                    <p className="text-2xl font-bold text-blue-600">{summary.auditedItems}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Matched Items</p>
                    <p className="text-2xl font-bold text-green-600">{summary.matched}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Discrepancies</p>
                    <p className="text-2xl font-bold text-red-600">{summary.discrepancies}</p>
                  </div>
                </div>
                
                <div className="mt-6">
                  <div className="flex justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Audit Completion</span>
                    <span className="text-sm font-medium">
                      {summary.totalItems > 0 
                        ? Math.round((summary.auditedItems / summary.totalItems) * 100) 
                        : 0}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div 
                      className="bg-blue-600 h-2.5 rounded-full" 
                      style={{ width: `${summary.totalItems > 0 
                        ? Math.round((summary.auditedItems / summary.totalItems) * 100) 
                        : 0}%` }}
                    ></div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white">
              <CardHeader>
                <CardTitle>Detailed Report</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SKU</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>System Qty</TableHead>
                        <TableHead>Physical Qty</TableHead>
                        <TableHead>Variance</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tableData.length > 0 ? (
                        tableData.map((item) => (
                          <TableRow key={`${item.id}-${item.location}`}>
                            <TableCell>{item.sku}</TableCell>
                            <TableCell>{item.name}</TableCell>
                            <TableCell>{item.location}</TableCell>
                            <TableCell>{item.systemQuantity}</TableCell>
                            <TableCell>{item.physicalQuantity}</TableCell>
                            <TableCell className={item.variance !== 0 ? "text-red-600 font-medium" : ""}>{item.variance}</TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                item.status === 'matched' ? 'bg-green-100 text-green-800' : 
                                item.status === 'discrepancy' ? 'bg-red-100 text-red-800' : 
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {item.status === 'matched' ? 'Matched' : 
                                 item.status === 'discrepancy' ? 'Discrepancy' : 
                                 'Pending'}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-4">No data available</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div> 
        ) : (
          <div className="absolute top-2/4 left-2/4 translate-2/4">
            <h1 className="text-black/50 font-semibold text-[1.2rem]">Currently You Don't have access</h1>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Reports;