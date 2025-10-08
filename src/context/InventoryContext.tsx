import React, { createContext, useContext, useState, useEffect } from "react";
import SupabaseDataService from "@/services/SupabaseDataService";

// Define types for inventory items
export interface InventoryItem {
  id: string;
  sku: string;
  name?: string;
  category?: string;
  location: string;
  systemQuantity: number;
  physicalQuantity?: number;
  status?: 'pending' | 'matched' | 'discrepancy';
  lastAudited?: string;
  notes?: string;
}

export interface Location {
  id: string;
  name: string;
  description?: string;
  active?: boolean;
}

export type QuestionType = 'text' | 'singleSelect' | 'multiSelect' | 'yesNo';

export interface QuestionOption {
  id: string;
  text: string;
}

export interface Question {
  id: string;
  text: string;
  type: QuestionType;
  required: boolean;
  options?: QuestionOption[];
}

export interface QuestionnaireAnswer {
  questionId: string;
  locationId: string;
  answer: string | string[];
  answeredBy?: string;
  answeredOn: string;
}

// Define the context interface
interface InventoryContextType {
  itemMaster: InventoryItem[];
  closingStock: InventoryItem[];
  auditedItems: InventoryItem[];
  locations: Location[];
  questions: Question[];
  questionnaireAnswers: QuestionnaireAnswer[];
  setItemMaster: (items: InventoryItem[]) => void;
  setClosingStock: (items: InventoryItem[]) => void;
  updateAuditedItem: (item: InventoryItem) => Promise<void>;
  getInventorySummary: () => {
    totalItems: number;
    auditedItems: number;
    pendingItems: number;
    matched: number;
    discrepancies: number;
  };
  getLocationSummary: (location: string) => {
    totalItems: number;
    auditedItems: number;
    pendingItems: number;
    matched: number;
    discrepancies: number;
  };
  clearAllData: () => void;
  addLocation: (location: Omit<Location, 'id'>) => Promise<void>;
  updateLocation: (location: Location) => Promise<void>;
  deleteLocation: (locationId: string) => Promise<void>;
  scanItem: (barcode: string, location: string) => void;
  searchItem: (query: string) => InventoryItem[];
  addItemToAudit: (item: InventoryItem, quantity: number) => void;
  addQuestion: (question: Omit<Question, 'id'>) => Promise<void>;
  updateQuestion: (question: Question) => Promise<void>;
  deleteQuestion: (questionId: string) => Promise<void>;
  saveQuestionnaireAnswer: (answer: Omit<QuestionnaireAnswer, 'answeredOn'>) => Promise<void>;
  getLocationQuestionnaireAnswers: (locationId: string) => QuestionnaireAnswer[];
  getQuestionsForLocation: (locationId: string) => Question[];
  getQuestionById: (questionId: string) => Question | undefined;
}

// Create the context
const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

// Provider component
export const InventoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [itemMaster, setItemMasterState] = useState<InventoryItem[]>([]);
  const [closingStock, setClosingStockState] = useState<InventoryItem[]>([]);
  const [auditedItems, setAuditedItemsState] = useState<InventoryItem[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionnaireAnswers, setQuestionnaireAnswers] = useState<QuestionnaireAnswer[]>([]);
  
  // Load data from persistence service on component mount
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load All Data
        const masterItems = await SupabaseDataService.getItemMaster();
        setItemMasterState(masterItems);
        
        setClosingStockState(await SupabaseDataService.getClosingStock());
        setAuditedItemsState(await SupabaseDataService.getAuditedItems());
        
        // This line ensures existing locations are loaded
        setLocations(await SupabaseDataService.getLocations()); 
        
        setQuestions(await SupabaseDataService.getQuestions() || []);
        setQuestionnaireAnswers(await SupabaseDataService.getQuestionnaireAnswers() || []);
      } catch (error) {
        console.error("Error loading inventory data:", error);
      }
    };
    
    loadData();
  }, []);
  
  // Set item master with persistence
  const setItemMaster = async (items: InventoryItem[]) => {
    // ⚠️ Note: SupabaseDataService now uses UPSERT to merge this master data with existing records.
    await SupabaseDataService.setItemMaster(items);
    
    // Refresh client-side state after DB operation
    setItemMasterState(await SupabaseDataService.getItemMaster());
    setClosingStockState(await SupabaseDataService.getClosingStock()); 
  };
  
  // Set closing stock with persistence
  const setClosingStock = async (items: InventoryItem[]) => {
    // 🐛 FIX: Merge incoming closing stock data with existing item master data 
    // to ensure the 'name' field is preserved for existing items OR present for new ones, 
    // satisfying the DB's NOT NULL constraint.
    const mergedClosingStock = items.map(incomingItem => {
      // Find the corresponding item in the current master data state
      const existingItem = itemMaster.find(
        i => i.sku === incomingItem.sku && i.location === incomingItem.location
      );
      
      // If found, merge the new quantity data, preserving the master data's name.
      if (existingItem) {
        return {
          ...existingItem, // Preserve existing id, name, category, etc.
          systemQuantity: incomingItem.systemQuantity, // Update quantity from closing stock
        };
      }
      
      // If not found (new item), return the incoming item as is. This assumes the incoming 
      // CSV data (or processor) includes a 'name' field for new items.
      return incomingItem; 
    });

    // SupabaseDataService uses UPSERT with full object, which now has the correct 'name' field.
    await SupabaseDataService.setClosingStock(mergedClosingStock);
    
    // Refresh client-side state after DB operation
    setItemMasterState(await SupabaseDataService.getItemMaster());
    setClosingStockState(await SupabaseDataService.getClosingStock());
  };
  
  // Update a single audited item
  const updateAuditedItem = async (item: InventoryItem) => {
    
    const itemToUpdate: InventoryItem = {
      ...item,
      physicalQuantity: item.physicalQuantity || 0, // Ensure quantity is a number
      status: item.physicalQuantity !== undefined && item.systemQuantity === item.physicalQuantity ? 'matched' : (item.physicalQuantity !== undefined ? 'discrepancy' : 'pending'),
      lastAudited: new Date().toISOString()
    };
    
    // Persist the single item update. The service uses auditedItemToDb to protect the name.
    await SupabaseDataService.setAuditedItems([itemToUpdate]);

    // Refresh client-side state after DB operation
    setItemMasterState(await SupabaseDataService.getItemMaster());
    setClosingStockState(await SupabaseDataService.getClosingStock());
    setAuditedItemsState(await SupabaseDataService.getAuditedItems());
  };
  
  // Add a new location
  const addLocation = async (location: Omit<Location, 'id'>) => {
    // 🐛 FIX: Use a temporary client ID. The SupabaseDataService will decide if it needs to remove it 
    // to let Postgres generate a proper UUID.
    const tempId = `loc${Date.now()}`;
    const newLocation: Location = {
      id: tempId,
      name: location.name,
      description: location.description,
      active: location.active !== undefined ? location.active : true
    };
    
    // Persist and then refresh locations from DB to get the final DB-generated ID
    await SupabaseDataService.updateLocation(newLocation);
    setLocations(await SupabaseDataService.getLocations());
  };
  
  // Update an existing location
  const updateLocation = async (location: Location) => {
    // Persist and then refresh locations from DB to ensure consistency
    await SupabaseDataService.updateLocation(location);
    setLocations(await SupabaseDataService.getLocations());
  };
  
  // Delete a location
  const deleteLocation = async (locationId: string) => {
    // Check if the location is being used by any items
    const locationToDelete = locations.find(loc => loc.id === locationId);
    
    if (!locationToDelete) return; // Already deleted or not found
    
    const itemsInLocation = itemMaster.some(item => item.location === locationToDelete.name);
    
    if (itemsInLocation) {
      throw new Error("Cannot delete location that contains inventory items");
    }
    
    // Delete and then refresh locations from DB
    await SupabaseDataService.deleteLocation(locationId);
    setLocations(await SupabaseDataService.getLocations());
  };
  
  // Scan an item by barcode
  const scanItem = async (barcode: string, locationName: string) => {
    // Find item in master data
    const item = itemMaster.find(i => 
      (i.id === barcode || i.sku === barcode) && i.location === locationName
    );
    
    if (!item) {
      throw new Error(`Item with barcode ${barcode} not found at location ${locationName}`);
    }
    
    // Update the audited item
    await updateAuditedItem({
      ...item,
      // Increment physical quantity, or set to 1 if undefined
      physicalQuantity: (item.physicalQuantity !== undefined ? item.physicalQuantity : 0) + 1,
      // Status will be correctly calculated inside updateAuditedItem
      status: 'pending' // Initial status before final check in updateAuditedItem
    });
  };
  
  // Search for items
  const searchItem = (query: string): InventoryItem[] => {
    if (!query || query.length < 2) return [];
    
    const lowerCaseQuery = query.toLowerCase();
    return itemMaster.filter(item => 
      item.id?.toLowerCase().includes(lowerCaseQuery) ||
      item.sku?.toLowerCase().includes(lowerCaseQuery) ||
      item.name?.toLowerCase().includes(lowerCaseQuery) ||
      item.category?.toLowerCase().includes(lowerCaseQuery)
    );
  };
  
  // Add an item to the audit with specified quantity
  const addItemToAudit = async (item: InventoryItem, quantity: number) => {
    if (quantity < 0) return;
    
    await updateAuditedItem({
      ...item,
      physicalQuantity: quantity,
      // Status will be correctly calculated inside updateAuditedItem
      status: quantity === item.systemQuantity ? 'matched' : 'discrepancy',
      lastAudited: new Date().toISOString()
    });
  };
  
  // Calculate summary for all inventory
  const getInventorySummary = () => {
    const totalItems = itemMaster.length;
    // We need to count how many unique sku/location pairs have been audited
    const auditedItemKeys = new Set(auditedItems.map(i => `${i.sku}-${i.location}`));
    const auditedItemsCount = auditedItemKeys.size;
    
    // Filter the current itemMaster against the latest audit data for matched/discrepancy status
    let matched = 0;
    let discrepancies = 0;
    
    itemMaster.forEach(masterItem => {
      const audited = auditedItems.find(a => a.sku === masterItem.sku && a.location === masterItem.location);
      if (audited) {
        if (audited.status === 'matched') {
          matched++;
        } else if (audited.status === 'discrepancy') {
          discrepancies++;
        }
      }
    });

    return {
      totalItems,
      auditedItems: auditedItemsCount,
      pendingItems: totalItems - auditedItemsCount,
      matched: matched,
      discrepancies: discrepancies
    };
  };
  
  // Calculate summary for a specific location
  const getLocationSummary = (locationName: string) => {
    const locationItems = itemMaster.filter(item => item.location === locationName);
    const locationAuditedItems = auditedItems.filter(item => item.location === locationName);
    const totalItems = locationItems.length;
    const auditedItemsCount = locationAuditedItems.length;
    
    let matched = 0;
    let discrepancies = 0;
    
    locationItems.forEach(masterItem => {
      const audited = locationAuditedItems.find(a => a.sku === masterItem.sku && a.location === masterItem.location);
      if (audited) {
        if (audited.status === 'matched') {
          matched++;
        } else if (audited.status === 'discrepancy') {
          discrepancies++;
        }
      }
    });

    return {
      totalItems,
      auditedItems: auditedItemsCount,
      pendingItems: totalItems - auditedItemsCount,
      matched: matched,
      discrepancies: discrepancies
    };
  };
  
  // Add a new question
  const addQuestion = async (question: Omit<Question, 'id'>) => {
    const id = `q${Date.now()}`;
    const newQuestion: Question = {
      id,
      ...question
    };
    
    const updatedQuestions = [...questions, newQuestion];
    await SupabaseDataService.setQuestions(updatedQuestions);
    setQuestions(updatedQuestions);
  };
  
  // Update an existing question
  const updateQuestion = async (question: Question) => {
    const updatedQuestions = questions.map(q => 
      q.id === question.id ? question : q
    );
    
    await SupabaseDataService.setQuestions(updatedQuestions);
    setQuestions(updatedQuestions);
  };
  
  // Delete a question
  const deleteQuestion = async (questionId: string) => {
    const updatedQuestions = questions.filter(q => q.id !== questionId);
    await SupabaseDataService.setQuestions(updatedQuestions);
    setQuestions(updatedQuestions);
    
    // Also remove any answers to this question
    const updatedAnswers = questionnaireAnswers.filter(a => a.questionId !== questionId);
    await SupabaseDataService.setQuestionnaireAnswers(updatedAnswers);
    setQuestionnaireAnswers(updatedAnswers);
  };
  
  // Save a questionnaire answer
  const saveQuestionnaireAnswer = async (answer: Omit<QuestionnaireAnswer, 'answeredOn'>) => {
    const newAnswer: QuestionnaireAnswer = {
      ...answer,
      answeredOn: new Date().toISOString()
    };
    
    // Check if we're updating an existing answer
    const existingIndex = questionnaireAnswers.findIndex(
      a => a.questionId === answer.questionId && a.locationId === answer.locationId
    );
    
    let updatedAnswers: QuestionnaireAnswer[];
    
    if (existingIndex >= 0) {
      updatedAnswers = [...questionnaireAnswers];
      updatedAnswers[existingIndex] = newAnswer;
    } else {
      updatedAnswers = [...questionnaireAnswers, newAnswer];
    }
    
    await SupabaseDataService.setQuestionnaireAnswers(updatedAnswers);
    setQuestionnaireAnswers(updatedAnswers);
  };
  
  // Get all answers for a specific location
  const getLocationQuestionnaireAnswers = (locationId: string): QuestionnaireAnswer[] => {
    return questionnaireAnswers.filter(answer => answer.locationId === locationId);
  };
  
  // Get all questions that have been answered for a location and those that haven't
  const getQuestionsForLocation = (locationId: string): Question[] => {
    return questions;
  };
  
  // Get a question by its ID
  const getQuestionById = (questionId: string): Question | undefined => {
    return questions.find(q => q.id === questionId);
  };
  
  // Clear all data
  const clearAllData = async () => {
    await SupabaseDataService.clearInventoryData();
    // Clear client-side state
    setItemMasterState([]);
    setClosingStockState([]);
    setAuditedItemsState([]);
    setQuestionnaireAnswers([]);
  };
  
  return (
    <InventoryContext.Provider
      value={{
        itemMaster,
        closingStock,
        auditedItems,
        locations,
        questions,
        questionnaireAnswers,
        setItemMaster,
        setClosingStock,
        updateAuditedItem,
        getInventorySummary,
        getLocationSummary,
        clearAllData,
        addLocation,
        updateLocation,
        deleteLocation,
        scanItem,
        searchItem,
        addItemToAudit,
        addQuestion,
        updateQuestion,
        deleteQuestion,
        saveQuestionnaireAnswer,
        getLocationQuestionnaireAnswers,
        getQuestionsForLocation,
        getQuestionById
      }}
    >
      {children}
    </InventoryContext.Provider>
  );
};

// Custom hook for using the inventory context
export const useInventory = () => {
  const context = useContext(InventoryContext);
  if (context === undefined) {
    throw new Error("useInventory must be used within an InventoryProvider");
  }
  return context;
};