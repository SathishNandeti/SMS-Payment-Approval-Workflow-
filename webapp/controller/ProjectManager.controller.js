    sap.ui.define([
        "sap/ui/core/mvc/Controller",
        "sap/ui/model/json/JSONModel",
        "sap/m/MessageToast",
        "sap/ui/core/ValueState",
        "sap/m/MessageBox",
        "sap/ui/core/BusyIndicator"
    ], function (Controller, JSONModel, MessageToast, ValueState, MessageBox, BusyIndicator) {
        "use strict";

        return Controller.extend("com.incresol.zpaymentworkflow.controller.ProjectManager", {

            onInit: function () {
                console.log("ProjectManager controller initialized");
                
                // Initialize view state model for bulk actions and currency display
                var oViewStateModel = new JSONModel({
                    showBulkActions: false,
                    selectedCount: 0,
                    showInLakhs: false // Default to rupees view
                });
                this.getView().setModel(oViewStateModel, "viewState");

                // Initialize tree data model
                var oTreeDataModel = new JSONModel({
                    treeData: []
                });
                this.getView().setModel(oTreeDataModel, "treeData");

                // Wait for OData model to be available and load data
                this._waitForModelAndLoadData();
            },

            _waitForModelAndLoadData: function() {
                var oModel = this.getView().getModel();
                
                if (oModel && oModel.getServiceMetadata()) {
                    // Model is ready, load data immediately
                    console.log("OData model ready, loading data");
                    this._loadPaymentData();
                } else if (oModel) {
                    // Model exists but metadata not loaded yet
                    console.log("Waiting for OData metadata to load");
                    oModel.attachMetadataLoaded(function() {
                        console.log("OData metadata loaded, now loading data");
                        this._loadPaymentData();
                    }.bind(this));
                    
                    oModel.attachMetadataFailed(function(oEvent) {
                        console.error("OData metadata loading failed:", oEvent.getParameters());
                        MessageToast.show("Failed to load OData metadata");
                    });
                } else {
                    // Model not available yet, retry after delay
                    console.log("OData model not available, retrying in 1 second");
                    setTimeout(function() {
                        this._waitForModelAndLoadData();
                    }.bind(this), 1000);
                }
            },

           _loadPaymentData: function () {
    var oModel = this.getView().getModel("oModel"); // ✅ named model

    if (!oModel) {
        MessageToast.show("OData model 'oModel' not available");
        return;
    }

    oModel.read("/PaymentHeaderSet", {
        urlParameters: {
            "$expand": "ToItems"
        },
        success: function (oData) {
    console.log("PaymentHeaderSet raw response:", oData);

    var aHeaders = (oData && oData.results) ? oData.results : [];
    console.log("Headers count:", aHeaders.length);

    if (aHeaders.length > 0) {
        console.log("Sample header:", aHeaders[0]);
        console.log("Sample header ToItems:", aHeaders[0].ToItems);
    }

    if (aHeaders.length === 0) {
        MessageToast.show("No payment data available");
        this.getView().getModel("treeData").setData({ treeData: [] });
        return;
    }

    this._transformExpandedHeaderToTree(aHeaders);
}.bind(this)
,
        error: function (oError) {
            console.error("Error loading PaymentHeaderSet with expand:", oError);
            this.getView().getModel("treeData").setData({ treeData: [] });
            MessageToast.show("Error loading payment data");
        }.bind(this)
    });
},
_transformExpandedHeaderToTree: function (aHeaders) {
    var aTreeData = aHeaders.map(function (oHeader) {
        var aItems = (oHeader.ToItems && oHeader.ToItems.results) ? oHeader.ToItems.results : [];

        return {
            // ===== Header (backend fields) =====
            ApprovalNo: oHeader.ApprovalNo,
            CreatedOn: oHeader.CreatedOn,
            ProfitCenter: oHeader.ProfitCenter,
            ProfitCenterName: oHeader.ProfitCenterName,
            VendorCode: oHeader.VendorCode,
            VendorName: oHeader.VendorName,
            CompanyCode: oHeader.CompanyCode,
            CreatedBy: oHeader.CreatedBy,
            CreatedAt: oHeader.CreationTime,     // ✅ metadata: CreationTime
            OverallStatus: oHeader.OverallStatus,

            // ===== Amounts from backend header =====
            TotalInvoiceAmt: oHeader.GrossAmount,
            TotalBaseAmt: oHeader.BaseAmount,
            TotalGstAmt: oHeader.GSTAmount,
            TotalTdsAmount: oHeader.TDSAmount,
            TotalLiability: oHeader.TotalLiability,
            TotalAmtClaimed: oHeader.AmountClaimed,

            ItemCount: aItems.length,

            isHeader: true,
            displayText: "Approval: " + oHeader.ApprovalNo + " - " + (oHeader.VendorName || ""),
            Currency: aItems.length > 0 ? aItems[0].Currency : "",

            // ===== Children =====
            children: aItems.map(function (oItem) {
                return Object.assign({}, oItem, {
                    isHeader: false,
                    displayText: "Item " + oItem.ItemNum + " - " + (oItem.VendorName || "")
                });
            })
        };
    });

    this.getView().getModel("treeData").setData({ treeData: aTreeData });

    setTimeout(function () {
        var oTreeTable = this.byId("idTreeTable");
        if (oTreeTable && aTreeData.length > 0) {
            for (var i = 0; i < aTreeData.length; i++) {
                oTreeTable.expand(i);
            }
        }
    }.bind(this), 100);
},

            _createHeaderStructureFromItems: function (aItems) {
                console.log("_createHeaderStructureFromItems called with", aItems.length, "items");
                console.log("Sample item data:", aItems[0]);
                
                // Group items by ApprovalNo to create PaymentHeaderSet-like structure
                var oGroupedData = {};
                
                aItems.forEach(function (oItem) {
                    var sApprovalNo = oItem.ApprovalNo;
                    
                    if (!oGroupedData[sApprovalNo]) {
                        // Create header structure matching PaymentHeaderSet fields EXACTLY
                        oGroupedData[sApprovalNo] = {
                            // PaymentHeaderSet fields (use exact field names from metadata)
                            ApprovalNo: sApprovalNo,
                            CreatedOn: oItem.DocDate || new Date(), // Use DocDate as CreatedOn
                            DateOfApproval: oItem.DocDate || new Date(), // Date of Approval
                            ProfitCenter: "PC001", // Mock data - replace with actual logic when PaymentHeaderSet is populated
                            ProfitCenterName: "Sample Profit Center", // Mock data - replace with actual logic when PaymentHeaderSet is populated
                            VendorCode: "", // Not available at header level from PaymentItemSet
                            CompanyCode: "1000", // Mock data - replace with actual logic when PaymentHeaderSet is populated
                            CreatedBy: "SYSTEM", // Mock data - replace with actual logic when PaymentHeaderSet is populated
                            CreatedAt: new Date(), // Current time
                            OverallStatus: "PENDING", // Default status
                            
                            // Display properties for tree functionality
                            isHeader: true,
                            displayText: "Approval: " + sApprovalNo,
                            
                            // Aggregated amounts (will be calculated from items)
                            TotalInvoiceAmt: 0,
                            TotalBaseAmt: 0,
                            TotalGstAmt: 0,
                            TotalTdsAmount: 0,
                            TotalLiability: 0,
                            TotalAmtClaimed: 0,
                            ItemCount: 0,
                            
                            // For header rows - NO vendor info (as per PaymentHeaderSet structure)
                            VendorCode: "", // Empty for header - vendor info only in items
                            VendorName: "", // Empty for header - vendor info only in items
                            Currency: aItems.length > 0 ? aItems[0].Currency : "",
                            
                            // Children items
                            children: []
                        };
                    }
                    
                    // Add item as child with original PaymentItemSet field names
                    var oChildItem = Object.assign({}, oItem, {
                        isHeader: false,
                        displayText: "Item " + oItem.ItemNum + " - " + oItem.VendorName
                        // Keep all original PaymentItemSet fields including VendorCode, VendorName, etc.
                    });
                    
                    oGroupedData[sApprovalNo].children.push(oChildItem);
                    
                    // Update header aggregated totals
                    var oHeader = oGroupedData[sApprovalNo];
                    oHeader.TotalInvoiceAmt += parseFloat(oItem.InvoiceAmt || 0);
                    oHeader.TotalBaseAmt += parseFloat(oItem.BaseAmt || 0);
                    oHeader.TotalGstAmt += parseFloat(oItem.GstAmt || 0);
                    oHeader.TotalTdsAmount += parseFloat(oItem.TdsAmount || 0);
                    oHeader.TotalLiability += parseFloat(oItem.TotalLiability || 0);
                    oHeader.TotalAmtClaimed += parseFloat(oItem.AmtClaimed || 0);
                    oHeader.ItemCount++;
                    
                    // Update header status based on item statuses
                    if (oItem.PmApprStatus && oItem.PmApprStatus !== "PENDING") {
                        oHeader.OverallStatus = oItem.PmApprStatus;
                    }
                });

                // Convert grouped data to tree array
                var aTreeData = Object.keys(oGroupedData).map(function (sKey) {
                    var oHeader = oGroupedData[sKey];
                    // Format aggregated amounts
                    oHeader.TotalInvoiceAmt = oHeader.TotalInvoiceAmt.toFixed(2);
                    oHeader.TotalBaseAmt = oHeader.TotalBaseAmt.toFixed(2);
                    oHeader.TotalGstAmt = oHeader.TotalGstAmt.toFixed(2);
                    oHeader.TotalTdsAmount = oHeader.TotalTdsAmount.toFixed(2);
                    oHeader.TotalLiability = oHeader.TotalLiability.toFixed(2);
                    oHeader.TotalAmtClaimed = oHeader.TotalAmtClaimed.toFixed(2);
                    
                    console.log("Final header created:", {
                        ApprovalNo: oHeader.ApprovalNo,
                        ProfitCenter: oHeader.ProfitCenter,
                        ProfitCenterName: oHeader.ProfitCenterName,
                        DateOfApproval: oHeader.DateOfApproval
                    });
                    
                    return oHeader;
                });

                console.log("Header structure created from PaymentItemSet:", aTreeData.length, "headers with", aItems.length, "total items");
                console.log("Tree data being set to model:", aTreeData);

                // Set the tree data to the model
                this.getView().getModel("treeData").setData({
                    treeData: aTreeData
                });

                // Expand first level after data is set
                setTimeout(function() {
                    var oTreeTable = this.byId("idTreeTable");
                    if (oTreeTable && aTreeData.length > 0) {
                        // Expand all first level nodes
                        for (var i = 0; i < aTreeData.length; i++) {
                            oTreeTable.expand(i);
                        }
                    }
                }.bind(this), 100);
            },

            _transformHeaderItemDataToTree: function (aHeaders, aItems) {
                console.log("_transformHeaderItemDataToTree called with:", aHeaders.length, "headers and", aItems.length, "items");
                if (aHeaders.length > 0) {
                    console.log("Sample header data:", aHeaders[0]);
                }
                
                // Create a map of items by ApprovalNo for quick lookup
                var oItemsByApproval = {};
                aItems.forEach(function(oItem) {
                    var sApprovalNo = oItem.ApprovalNo;
                    if (!oItemsByApproval[sApprovalNo]) {
                        oItemsByApproval[sApprovalNo] = [];
                    }
                    oItemsByApproval[sApprovalNo].push(oItem);
                });

                // Transform headers to tree structure
                var aTreeData = [];

                aHeaders.forEach(function(oHeader) {
                    var sApprovalNo = oHeader.ApprovalNo;
                    var aHeaderItems = oItemsByApproval[sApprovalNo] || [];
                    
                    console.log("Processing header:", sApprovalNo, "with fields:", {
                        ProfitCenter: oHeader.ProfitCenter,
                        ProfitCenterName: oHeader.ProfitCenterName,
                        CreatedOn: oHeader.CreatedOn
                    });
                    
                    // Calculate aggregated totals from items
                    var fTotalInvoiceAmt = 0;
                    var fTotalBaseAmt = 0;
                    var fTotalGstAmt = 0;
                    var fTotalTdsAmount = 0;
                    var fTotalLiability = 0;
                    var fTotalAmtClaimed = 0;
                    
                    aHeaderItems.forEach(function(oItem) {
                        fTotalInvoiceAmt += parseFloat(oItem.InvoiceAmt || 0);
                        fTotalBaseAmt += parseFloat(oItem.BaseAmt || 0);
                        fTotalGstAmt += parseFloat(oItem.GstAmt || 0);
                        fTotalTdsAmount += parseFloat(oItem.TdsAmount || 0);
                        fTotalLiability += parseFloat(oItem.TotalLiability || 0);
                        fTotalAmtClaimed += parseFloat(oItem.AmtClaimed || 0);
                    });

                    // Create header node using PaymentHeaderSet fields
                    var oHeaderNode = {
                        // PaymentHeaderSet fields (exact fields from metadata)
                        ApprovalNo: oHeader.ApprovalNo,
                        CreatedOn: oHeader.CreatedOn,
                        DateOfApproval: oHeader.CreatedOn, // Date of Approval from PaymentHeaderSet
                        ProfitCenter: oHeader.ProfitCenter,
                        ProfitCenterName: oHeader.ProfitCenterName,
                        CompanyCode: oHeader.CompanyCode,
                        CreatedBy: oHeader.CreatedBy,
                        CreatedAt: oHeader.CreatedAt,
                        OverallStatus: oHeader.OverallStatus,
                        
                        // Display properties
                        isHeader: true,
                        displayText: "Approval: " + oHeader.ApprovalNo + " - " + (oHeader.ProfitCenterName || ""),
                        
                        // Aggregated amounts from items
                        TotalInvoiceAmt: fTotalInvoiceAmt.toFixed(2),
                        TotalBaseAmt: fTotalBaseAmt.toFixed(2),
                        TotalGstAmt: fTotalGstAmt.toFixed(2),
                        TotalTdsAmount: fTotalTdsAmount.toFixed(2),
                        TotalLiability: fTotalLiability.toFixed(2),
                        TotalAmtClaimed: fTotalAmtClaimed.toFixed(2),
                        ItemCount: aHeaderItems.length,
                        
                        // Header level - NO vendor info (not available in PaymentHeaderSet)
                        VendorCode: "", // Not available in PaymentHeaderSet
                        VendorName: "", // Not available in PaymentHeaderSet
                        Currency: aHeaderItems.length > 0 ? aHeaderItems[0].Currency : "",
                        
                        // Children items
                        children: []
                    };
                    
                    console.log("Created header node:", {
                        ApprovalNo: oHeaderNode.ApprovalNo,
                        ProfitCenter: oHeaderNode.ProfitCenter,
                        ProfitCenterName: oHeaderNode.ProfitCenterName,
                        DateOfApproval: oHeaderNode.DateOfApproval
                    });

                    // Add child items
                    aHeaderItems.forEach(function(oItem) {
                        var oChildItem = Object.assign({}, oItem, {
                            isHeader: false,
                            displayText: "Item " + oItem.ItemNum + " - " + oItem.VendorName,
                            VendorCode: oItem.VendorCode // Map for view compatibility
                        });
                        oHeaderNode.children.push(oChildItem);
                    });

                    aTreeData.push(oHeaderNode);
                });

                console.log("Tree data created from PaymentHeaderSet:", aTreeData.length, "headers with total items:", aItems.length);
                if (aTreeData.length > 0) {
                    console.log("Final tree data sample:", aTreeData[0]);
                }

                // Set the tree data to the model
                this.getView().getModel("treeData").setData({
                    treeData: aTreeData
                });

                // Expand first level after data is set
                setTimeout(function() {
                    var oTreeTable = this.byId("idTreeTable");
                    if (oTreeTable && aTreeData.length > 0) {
                        // Expand all first level nodes
                        for (var i = 0; i < aTreeData.length; i++) {
                            oTreeTable.expand(i);
                        }
                    }
                }.bind(this), 100);
            },

            onSwitchShowInLakhsChange: function(oEvent) {
                var oSwitch = oEvent.getSource();
                var bState = oSwitch.getState();
                
                // Update the view state model
                var oViewStateModel = this.getView().getModel("viewState");
                oViewStateModel.setProperty("/showInLakhs", bState);
                
                // Show appropriate message
                var sMessage = bState ? "Amounts now displayed in Lakhs" : "Amounts now displayed in Rupees";
                MessageToast.show(sMessage);
            },

            onTreeTableRowSelectionChange: function (oEvent) {
                var oTable = oEvent.getSource();
                var aSelectedIndices = oTable.getSelectedIndices();
                var oViewStateModel = this.getView().getModel("viewState");
                
                // Update view state based on selection
                var bHasSelection = aSelectedIndices.length > 0;
                oViewStateModel.setProperty("/showBulkActions", bHasSelection);
                oViewStateModel.setProperty("/selectedCount", aSelectedIndices.length);
                
                if (bHasSelection) {
                    MessageToast.show(aSelectedIndices.length + " item(s) selected. Use buttons below to approve or reject.");
                }
            },

            onApproveButtonPress: function () {
                var oTable = this.byId("idTreeTable");
                var aSelectedIndices = oTable.getSelectedIndices();
                
                if (aSelectedIndices.length === 0) {
                    MessageToast.show("Please select items to approve");
                    return;
                }
                
                var aSelectedItems = [];
                aSelectedIndices.forEach(function(iIndex) {
                    var oContext = oTable.getContextByIndex(iIndex);
                    if (oContext) {
                        aSelectedItems.push(oContext.getObject());
                    }
                });
                
                this._openApprovalDialog(aSelectedItems, "APPROVE");
            },
            onRejectButtonPress: function () {
    var oTable = this.byId("idTreeTable");
    var aSelectedIndices = oTable.getSelectedIndices();

    if (!aSelectedIndices.length) {
        sap.m.MessageToast.show("Please select items to reject");
        return;
    }

    var aSelectedItems = [];
    aSelectedIndices.forEach(function (iIndex) {
        var oContext = oTable.getContextByIndex(iIndex);
        if (oContext) {
            aSelectedItems.push(oContext.getObject());
        }
    });

    // Open dialog (remarks mandatory)
    this._openApprovalDialog(aSelectedItems, "REJECT");
},
_openApprovalDialog: async function (aSelectedItems, sActionType) {
    var sDialogTitle = sActionType === "APPROVE" ? "Approve Items" : "Reject Items";

    // 1) Prepare dialog model data
    var oDialogModel = new sap.ui.model.json.JSONModel({
        title: sDialogTitle,
        actionType: sActionType === "APPROVE" ? "Approve" : "Reject",
        itemCount: aSelectedItems.length,
        selectedItems: aSelectedItems
    });

    // 2) Load fragment once
    if (!this._oApprovalDialog) {
        this._sDialogFragmentId = this.getView().getId() + "--ApprovalDialog"; // IMPORTANT
        this._oApprovalDialog = await sap.ui.core.Fragment.load({
            id: this._sDialogFragmentId,
            name: "com.incresol.zpaymentworkflow.view.ApprovalDialog", // <-- CHANGE to your fragment path
            controller: this
        });
        this.getView().addDependent(this._oApprovalDialog);
    }

    // 3) Set model on dialog (THIS IS THE KEY)
    this._oApprovalDialog.setModel(oDialogModel, "dialogModel");

    // 4) Store selected items + action in controller for processing
    this._aDialogSelectedItems = aSelectedItems;
    this._sDialogActionType = sActionType; 

    // 5) Open
    this._oApprovalDialog.open();
},


handleDialogConfirm: function () {
    var sActionType = this._sDialogActionType; // "APPROVE" or "REJECT"
    var aSelectedItems = this._aDialogSelectedItems;
    
    // For rejection, validate that all selected items have remarks
    if (sActionType === "REJECT") {
        var aItemsWithoutRemarks = [];
        
        aSelectedItems.forEach(function(oItem) {
            if (!oItem.isHeader && (!oItem.PmApprRemarks || oItem.PmApprRemarks.trim() === "")) {
                aItemsWithoutRemarks.push(oItem);
            }
        });
        
        if (aItemsWithoutRemarks.length > 0) {
            MessageToast.show("Please enter remarks for all items before rejecting. " + 
                            aItemsWithoutRemarks.length + " item(s) missing remarks.");
            this._oApprovalDialog.close();
            return;
        }
    }

    // Close dialog
    this._oApprovalDialog.close();

    // Call your existing bulk process method
    this._processBulkAction(this._aDialogSelectedItems, sActionType);
},


handleDialogCancel: function () {
    if (this._oApprovalDialog) {
        this._oApprovalDialog.close();
    }
},

onDialogAfterClose: function () {
    // Optional cleanup - dialog closed
},

onTdsAmountChange: function(oEvent) {
    var oInput = oEvent.getSource();
    var oContext = oInput.getBindingContext("treeData");
    var sNewValue = oEvent.getParameter("value");
    
    // Validate numeric input
    var fNewValue = parseFloat(sNewValue) || 0;
    if (fNewValue < 0) {
        fNewValue = 0;
        oInput.setValue(fNewValue.toFixed(2));
        MessageToast.show("TDS Amount cannot be negative");
        return;
    }
    
    // Format to 2 decimal places
    var sFormattedValue = fNewValue.toFixed(2);
    oInput.setValue(sFormattedValue);
    
    // Update the model
    oContext.getModel().setProperty(oContext.getPath() + "/TdsAmount", sFormattedValue);
    
    // Recalculate header totals
    this._recalculateHeaderTotals();
    
    // Send individual update to backend
    var oItem = oContext.getObject();
    this._sendIndividualUpdateToBackend(oItem, "TdsAmount", sFormattedValue);
    
    MessageToast.show("TDS Amount updated to ₹" + fNewValue.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
},

onPmApprAmountChange: function(oEvent) {
    var oInput = oEvent.getSource();
    var oContext = oInput.getBindingContext("treeData");
    var sNewValue = oEvent.getParameter("value");
    
    // Validate numeric input
    var fNewValue = parseFloat(sNewValue) || 0;
    if (fNewValue < 0) {
        fNewValue = 0;
        oInput.setValue(fNewValue.toFixed(2));
        MessageToast.show("PM Approved Amount cannot be negative");
        return;
    }
    
    // Format to 2 decimal places
    var sFormattedValue = fNewValue.toFixed(2);
    oInput.setValue(sFormattedValue);
    
    // Update the model
    oContext.getModel().setProperty(oContext.getPath() + "/PmApprAmt", sFormattedValue);
    
    // Send individual update to backend
    var oItem = oContext.getObject();
    this._sendIndividualUpdateToBackend(oItem, "PmApprAmt", sFormattedValue);
    
    MessageToast.show("PM Approved Amount updated to ₹" + fNewValue.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
},

_sendIndividualUpdateToBackend: function(oItem, sFieldName, sNewValue) {
    var oModel = this.getView().getModel("oModel");
    
    if (!oModel) {
        console.log("OData model not available for individual update");
        return;
    }

    // Use correct key fields: ApprovalNo and VendorCode
    var sApprovalNo = oItem.ApprovalNo;
    var sVendorCode = oItem.VendorCode || oItem.VendorNumber;
    
    if (!sApprovalNo || !sVendorCode) {
        console.error("Missing required key fields for individual update:", {
            ApprovalNo: sApprovalNo,
            VendorCode: sVendorCode,
            Item: oItem
        });
        MessageToast.show("Cannot update: Missing required key fields");
        return;
    }

    var sPath = "/PaymentItemSet(ApprovalNo='" + sApprovalNo + "',VendorCode='" + sVendorCode + "')";
    var oUpdateData = {};
    oUpdateData[sFieldName] = sNewValue;
    
    // Add timestamp and user for tracking
    if (sFieldName === "PmApprAmt" || sFieldName === "PmApprRemarks") {
        oUpdateData.PmApprOn = new Date();
        oUpdateData.PmUserId = this._getCurrentUserId();
    }

    console.log("Sending individual update to backend:", {
        Path: sPath,
        ApprovalNo: sApprovalNo,
        VendorCode: sVendorCode,
        Field: sFieldName,
        Value: sNewValue,
        UpdateData: oUpdateData
    });

    oModel.update(sPath, oUpdateData, {
        success: function(oData) {
            console.log("Individual field update successful:", sFieldName, sNewValue);
        },
        error: function(oError) {
            console.error("Individual field update failed:", oError);
            MessageToast.show("Failed to update " + sFieldName + " in backend");
        }
    });
},

onRemarksChange: function(oEvent) {
    var oInput = oEvent.getSource();
    var oContext = oInput.getBindingContext("treeData");
    var sNewValue = oEvent.getParameter("value");
    
    // Update the model
    oContext.getModel().setProperty(oContext.getPath() + "/PmApprRemarks", sNewValue);
    
    // Send individual update to backend
    var oItem = oContext.getObject();
    this._sendIndividualUpdateToBackend(oItem, "PmApprRemarks", sNewValue);
    
    MessageToast.show("Remarks updated");
},

_recalculateHeaderTotals: function() {
    var oTreeModel = this.getView().getModel("treeData");
    var aTreeData = oTreeModel.getData().treeData;
    
    // Recalculate totals for each header
    aTreeData.forEach(function(oHeader) {
        if (oHeader.isHeader && oHeader.children) {
            var fTotalTdsAmount = 0;
            
            oHeader.children.forEach(function(oItem) {
                fTotalTdsAmount += parseFloat(oItem.TdsAmount || 0);
            });
            
            // Update header totals
            oHeader.TotalTdsAmount = fTotalTdsAmount.toFixed(2);
        }
    });
    
    // Refresh the model
    oTreeModel.setData({ treeData: aTreeData });
},

            _processBulkAction: function (aSelectedItems, sActionType) {
                var oTreeModel = this.getView().getModel("treeData");
                var aTreeData = oTreeModel.getData().treeData;
                var sStatus = sActionType === "APPROVE" ? "APPROVED" : "REJECTED";
                var sDefaultRemarks = sActionType === "APPROVE" ? "Approved via bulk action" : "Rejected via bulk action";
                
                // Prepare payload with all line item details
                var aPayloadItems = [];
                
                aSelectedItems.forEach(function(oSelectedItem) {
                    if (!oSelectedItem.isHeader) {
                        // Individual item selected
                        var oPayloadItem = this._createPayloadItem(oSelectedItem, sStatus, sDefaultRemarks);
                        aPayloadItems.push(oPayloadItem);
                    } else {
                        // Header selected - include all its children
                        var oHeader = this._findHeaderInTreeData(aTreeData, oSelectedItem.ApprovalNo);
                        if (oHeader && oHeader.children) {
                            oHeader.children.forEach(function(oChildItem) {
                                var oPayloadItem = this._createPayloadItem(oChildItem, sStatus, sDefaultRemarks);
                                aPayloadItems.push(oPayloadItem);
                            }.bind(this));
                        }
                    }
                }.bind(this));
                
                // Send payload to backend
                this._sendApprovalPayloadToBackend(aPayloadItems, sActionType, aSelectedItems);
            },

            _createPayloadItem: function(oItem, sStatus, sDefaultRemarks) {
                var sCurrentUser = this._getCurrentUserId();
                
                // Ensure required key fields are properly formatted
                var sApprovalNo = (oItem.ApprovalNo || "").toString().trim();
                var sVendorCode = (oItem.VendorCode || oItem.VendorNumber || "").toString().trim();
                
                if (!sApprovalNo || !sVendorCode) {
                    console.warn("Missing required key fields for payload item:", {
                        ApprovalNo: sApprovalNo,
                        VendorCode: sVendorCode,
                        Item: oItem
                    });
                }
                
                return {
                    // Key fields (required for OData operations)
                    ApprovalNo: sApprovalNo,
                    VendorCode: sVendorCode,
                    VendorNumber: sVendorCode, // Alias for compatibility
                    
                    // Other fields
                    ItemNum: (oItem.ItemNum || "").toString(),
                    VendorName: (oItem.VendorName || "").toString(),
                    DocNum: (oItem.DocNum || "").toString(),
                    LiabHead: (oItem.LiabHead || "").toString(),
                    PurchDoc: (oItem.PurchDoc || "").toString(),
                    DocDate: oItem.DocDate,
                    PostingDt: oItem.PostingDt,
                    InvoiceAmt: (parseFloat(oItem.InvoiceAmt || 0)).toString(),
                    BaseAmt: (parseFloat(oItem.BaseAmt || 0)).toString(),
                    GstAmt: (parseFloat(oItem.GstAmt || 0)).toString(),
                    TdsAmount: (parseFloat(oItem.TdsAmount || 0)).toString(),
                    TotalLiability: (parseFloat(oItem.TotalLiability || 0)).toString(),
                    AmtClaimed: (parseFloat(oItem.AmtClaimed || 0)).toString(),
                    PmApprAmt: (parseFloat(oItem.PmApprAmt || 0)).toString(),
                    PmApprStatus: sStatus,
                    PmApprRemarks: (oItem.PmApprRemarks || sDefaultRemarks || "").toString(),
                    PmApprOn: new Date().toISOString(),
                    PmUserId: sCurrentUser,
                    Currency: (oItem.Currency || "INR").toString(),
                    AccountNumber: (oItem.AccountNumber || "").toString(),
                    BankName: (oItem.BankName || "").toString(),
                    // Include other fields with safe defaults
                    TaxNum: (oItem.TaxNum || "").toString(),
                    BankKey: (oItem.BankKey || "").toString(),
                    ReferenceDoc: (oItem.ReferenceDoc || "").toString(),
                    Gst2aRef: (parseFloat(oItem.Gst2aRef || 0)).toString(),
                    Gst2aNref: (parseFloat(oItem.Gst2aNref || 0)).toString(),
                    AprnoRef: (oItem.AprnoRef || "").toString(),
                    AmtPaid: (parseFloat(oItem.AmtPaid || 0)).toString(),
                    Gstr1Details: (oItem.Gstr1Details || "").toString(),
                    Remark: (oItem.Remark || "").toString(),
                    AccountHolder: (oItem.AccountHolder || "").toString(),
                    Branch: (oItem.Branch || "").toString()
                };
            },

            _getCurrentUserId: function() {
                // Try to get current user from various sources
                try {
                    // Option 1: From shell service (if available)
                    if (sap.ushell && sap.ushell.Container) {
                        var oUser = sap.ushell.Container.getService("UserInfo").getUser();
                        if (oUser && oUser.getId) {
                            return oUser.getId();
                        }
                    }
                    
                    // Option 2: From OData model user context (if available)
                    var oModel = this.getView().getModel("oModel");
                    if (oModel && oModel.getCurrentUser) {
                        return oModel.getCurrentUser();
                    }
                    
                    // Option 3: Default fallback
                    return "CURRENT_USER";
                } catch (e) {
                    console.log("Could not determine current user, using default");
                    return "CURRENT_USER";
                }
            },

            // Test method to verify payload structure (for debugging)
            _testPayloadStructure: function() {
                var oTreeModel = this.getView().getModel("treeData");
                var aTreeData = oTreeModel.getData().treeData;
                
                if (aTreeData.length > 0 && aTreeData[0].children && aTreeData[0].children.length > 0) {
                    var oTestItem = aTreeData[0].children[0];
                    var oPayloadItem = this._createPayloadItem(oTestItem, "APPROVED", "Test approval");
                    
                    console.log("=== TEST PAYLOAD STRUCTURE ===");
                    console.log("Sample Item:", oTestItem);
                    console.log("Generated Payload:", oPayloadItem);
                    console.log("OData Path would be:", "/PaymentItemSet(ApprovalNo='" + oPayloadItem.ApprovalNo + "',VendorCode='" + oPayloadItem.VendorCode + "')");
                    console.log("Key Fields Check:", {
                        ApprovalNo: oPayloadItem.ApprovalNo,
                        VendorCode: oPayloadItem.VendorCode,
                        Valid: !!(oPayloadItem.ApprovalNo && oPayloadItem.VendorCode)
                    });
                    console.log("==============================");
                    
                    return oPayloadItem;
                }
                
                return null;
            },

            // Debug method to check data structure
            _debugDataStructure: function() {
                var oTreeModel = this.getView().getModel("treeData");
                var aTreeData = oTreeModel.getData().treeData;
                
                console.log("=== DATA STRUCTURE DEBUG ===");
                console.log("Tree Data Count:", aTreeData.length);
                
                if (aTreeData.length > 0) {
                    var oFirstHeader = aTreeData[0];
                    console.log("First Header:", {
                        ApprovalNo: oFirstHeader.ApprovalNo,
                        VendorCode: oFirstHeader.VendorCode,
                        VendorName: oFirstHeader.VendorName,
                        ChildrenCount: oFirstHeader.children ? oFirstHeader.children.length : 0
                    });
                    
                    if (oFirstHeader.children && oFirstHeader.children.length > 0) {
                        var oFirstChild = oFirstHeader.children[0];
                        console.log("First Child Item:", {
                            ApprovalNo: oFirstChild.ApprovalNo,
                            VendorCode: oFirstChild.VendorCode,
                            VendorNumber: oFirstChild.VendorNumber,
                            VendorName: oFirstChild.VendorName,
                            ItemNum: oFirstChild.ItemNum,
                            AllKeys: Object.keys(oFirstChild).filter(key => key.toLowerCase().includes('vendor'))
                        });
                    }
                }
                console.log("============================");
            },

            _findHeaderInTreeData: function(aTreeData, sApprovalNo) {
                return aTreeData.find(function(oHeader) {
                    return oHeader.ApprovalNo === sApprovalNo && oHeader.isHeader;
                });
            },

            _sendApprovalPayloadToBackend: function(aPayloadItems, sActionType, aSelectedItems) {
                var oModel = this.getView().getModel("oModel");
                
                if (!oModel) {
                    MessageToast.show("OData model not available");
                    // Still update local model
                    this._updateLocalModel(aSelectedItems, sActionType);
                    return;
                }

                var oPayload = {
                    Action: sActionType,
                    ProcessedBy: this._getCurrentUserId(),
                    ProcessedOn: new Date().toISOString(),
                    ItemCount: aPayloadItems.length,
                    Items: aPayloadItems
                };

                console.log("=== APPROVAL PAYLOAD ===");
                console.log("Action:", sActionType);
                console.log("Items Count:", aPayloadItems.length);
                console.log("Full Payload:", JSON.stringify(oPayload, null, 2));
                console.log("========================");

                // Show simulated batch call details
                var oBatchCallDetails = this._simulateBatchCall(aPayloadItems, sActionType);
                
                // Also log the curl command equivalent
                this._logCurlCommand(oBatchCallDetails);

                // Process updates to backend
                this._processBatchUpdate(oModel, aPayloadItems, sActionType, aSelectedItems);
            },

            _logCurlCommand: function(oBatchCallDetails) {
                var sCurlCommand = "curl -X POST '" + oBatchCallDetails.url + "' \\\n";
                
                Object.keys(oBatchCallDetails.headers).forEach(function(sHeader) {
                    sCurlCommand += "  -H '" + sHeader + ": " + oBatchCallDetails.headers[sHeader] + "' \\\n";
                });
                
                sCurlCommand += "  --data-raw '" + oBatchCallDetails.body.replace(/'/g, "\\'") + "'";
                
                console.log("=== CURL COMMAND EQUIVALENT ===");
                console.log(sCurlCommand);
                console.log("===============================");
            },

            _processBatchUpdate: function(oModel, aPayloadItems, sActionType, aSelectedItems) {
                var sCurrentUser = this._getCurrentUserId();
                var iProcessedCount = 0;
                var iTotalCount = aPayloadItems.length;
                var aErrors = [];
                
                // Show busy indicator
                sap.ui.core.BusyIndicator.show(0);
                
                console.log("Processing " + iTotalCount + " items for " + sActionType);
                
                // Log the complete batch request details
                this._logBatchRequestDetails(oModel, aPayloadItems, sActionType);
                
                // Process each item sequentially
                var fnProcessNextItem = function(iIndex) {
                    if (iIndex >= aPayloadItems.length) {
                        // All items processed
                        sap.ui.core.BusyIndicator.hide();
                        
                        if (aErrors.length === 0) {
                            // All successful
                            console.log("All " + iTotalCount + " items processed successfully");
                            MessageToast.show(iTotalCount + " items " + 
                                            (sActionType === "APPROVE" ? "approved" : "rejected") + 
                                            " successfully and sent to backend");
                        } else {
                            // Some errors
                            console.error("Processed " + iProcessedCount + " items, " + aErrors.length + " errors");
                            MessageToast.show("Processed " + iProcessedCount + " items successfully. " + 
                                            aErrors.length + " items failed.");
                        }
                        
                        // Update local model regardless
                        this._updateLocalModel(aSelectedItems, sActionType);
                        return;
                    }
                    
                    var oPayloadItem = aPayloadItems[iIndex];
                    
                    // Use correct key fields: ApprovalNo and VendorCode
                    var sApprovalNo = oPayloadItem.ApprovalNo;
                    var sVendorCode = oPayloadItem.VendorNumber || oPayloadItem.VendorCode;
                    
                    if (!sApprovalNo || !sVendorCode) {
                        console.error("Missing required key fields:", {
                            ApprovalNo: sApprovalNo,
                            VendorCode: sVendorCode,
                            Item: oPayloadItem
                        });
                        aErrors.push({
                            item: oPayloadItem,
                            error: "Missing required key fields"
                        });
                        fnProcessNextItem.call(this, iIndex + 1);
                        return;
                    }
                    
                    var sPath = "/PaymentItemSet(ApprovalNo='" + sApprovalNo + "',VendorCode='" + sVendorCode + "')";
                    
                    // Prepare update data
                    var oUpdateData = {
                        PmApprAmt: oPayloadItem.PmApprAmt,
                        PmApprStatus: oPayloadItem.PmApprStatus,
                        PmApprRemarks: oPayloadItem.PmApprRemarks,
                        PmApprOn: new Date(),
                        PmUserId: sCurrentUser,
                        TdsAmount: oPayloadItem.TdsAmount
                    };
                    
                    console.log("Updating item " + (iIndex + 1) + "/" + iTotalCount + ":", {
                        Path: sPath,
                        ApprovalNo: sApprovalNo,
                        VendorCode: sVendorCode,
                        Data: oUpdateData
                    });
                    
                    // Log individual HTTP request details
                    this._logIndividualRequestDetails(sPath, oUpdateData, iIndex + 1);
                    
                    // Update individual item
                    oModel.update(sPath, oUpdateData, {
                        success: function(oData) {
                            iProcessedCount++;
                            console.log("Item " + (iIndex + 1) + " updated successfully");
                            // Process next item
                            fnProcessNextItem.call(this, iIndex + 1);
                        }.bind(this),
                        error: function(oError) {
                            aErrors.push({
                                item: oPayloadItem,
                                error: oError
                            });
                            console.error("Item " + (iIndex + 1) + " update failed:", oError);
                            // Continue with next item even if this one failed
                            fnProcessNextItem.call(this, iIndex + 1);
                        }.bind(this)
                    });
                }.bind(this);
                
                // Start processing from first item
                fnProcessNextItem(0);
            },

            _logBatchRequestDetails: function(oModel, aPayloadItems, sActionType) {
                var sServiceUrl = oModel.sServiceUrl || "";
                var sBatchUrl = sServiceUrl + "/$batch";
                var sBoundary = "batch_" + Date.now();
                
                console.log("=== BATCH REQUEST DETAILS ===");
                console.log("Service URL:", sServiceUrl);
                console.log("Batch URL:", sBatchUrl);
                console.log("Action:", sActionType);
                console.log("Items Count:", aPayloadItems.length);
                console.log("HTTP Method: POST");
                console.log("Content-Type: multipart/mixed; boundary=" + sBoundary);
                
                // Log headers that would be sent
                console.log("Expected Headers:", {
                    "Content-Type": "multipart/mixed; boundary=" + sBoundary,
                    "Accept": "application/json",
                    "DataServiceVersion": "2.0",
                    "X-Requested-With": "XMLHttpRequest"
                });
                
                // Generate the actual batch request body
                var sBatchBody = this._generateBatchRequestBody(aPayloadItems, sBoundary, sServiceUrl);
                console.log("=== BATCH REQUEST BODY ===");
                console.log(sBatchBody);
                console.log("=========================");
                
                // Log each item that would be in the batch
                console.log("Batch Items Summary:");
                aPayloadItems.forEach(function(oItem, iIndex) {
                    var sPath = "/PaymentItemSet(ApprovalNo='" + oItem.ApprovalNo + "',VendorCode='" + (oItem.VendorCode || oItem.VendorNumber) + "')";
                    console.log("  Item " + (iIndex + 1) + ":", {
                        Method: "PUT",
                        Path: sPath,
                        FullURL: sServiceUrl + sPath,
                        Data: {
                            PmApprAmt: oItem.PmApprAmt,
                            PmApprStatus: oItem.PmApprStatus,
                            PmApprRemarks: oItem.PmApprRemarks,
                            TdsAmount: oItem.TdsAmount
                        }
                    });
                });
                console.log("=============================");
            },

            _generateBatchRequestBody: function(aPayloadItems, sBoundary, sServiceUrl) {
                var sCurrentUser = this._getCurrentUserId();
                var sBatchBody = "";
                
                aPayloadItems.forEach(function(oItem, iIndex) {
                    var sPath = "/PaymentItemSet(ApprovalNo='" + oItem.ApprovalNo + "',VendorCode='" + (oItem.VendorCode || oItem.VendorNumber) + "')";
                    var oUpdateData = {
                        PmApprAmt: oItem.PmApprAmt,
                        PmApprStatus: oItem.PmApprStatus,
                        PmApprRemarks: oItem.PmApprRemarks,
                        PmApprOn: new Date().toISOString(),
                        PmUserId: sCurrentUser,
                        TdsAmount: oItem.TdsAmount
                    };
                    
                    sBatchBody += "--" + sBoundary + "\r\n";
                    sBatchBody += "Content-Type: application/http\r\n";
                    sBatchBody += "Content-Transfer-Encoding: binary\r\n";
                    sBatchBody += "\r\n";
                    sBatchBody += "PUT " + sPath + " HTTP/1.1\r\n";
                    sBatchBody += "Content-Type: application/json\r\n";
                    sBatchBody += "Accept: application/json\r\n";
                    sBatchBody += "DataServiceVersion: 2.0\r\n";
                    sBatchBody += "\r\n";
                    sBatchBody += JSON.stringify(oUpdateData) + "\r\n";
                });
                
                sBatchBody += "--" + sBoundary + "--\r\n";
                
                return sBatchBody;
            },

            // Method to simulate the actual batch call
            _simulateBatchCall: function(aPayloadItems, sActionType) {
                var oModel = this.getView().getModel("oModel");
                var sServiceUrl = oModel.sServiceUrl || "";
                var sBatchUrl = sServiceUrl + "/$batch";
                var sBoundary = "batch_" + Date.now();
                var sBatchBody = this._generateBatchRequestBody(aPayloadItems, sBoundary, sServiceUrl);
                
                console.log("=== SIMULATED BATCH CALL ===");
                console.log("URL: POST " + sBatchUrl);
                console.log("Headers:");
                console.log("  Content-Type: multipart/mixed; boundary=" + sBoundary);
                console.log("  Accept: application/json");
                console.log("  DataServiceVersion: 2.0");
                console.log("  X-Requested-With: XMLHttpRequest");
                console.log("");
                console.log("Request Body:");
                console.log(sBatchBody);
                console.log("============================");
                
                // You can copy this information to test with tools like Postman
                return {
                    url: sBatchUrl,
                    method: "POST",
                    headers: {
                        "Content-Type": "multipart/mixed; boundary=" + sBoundary,
                        "Accept": "application/json",
                        "DataServiceVersion": "2.0",
                        "X-Requested-With": "XMLHttpRequest"
                    },
                    body: sBatchBody
                };
            },

            _logIndividualRequestDetails: function(sPath, oUpdateData, iItemNumber) {
                var oModel = this.getView().getModel("oModel");
                var sServiceUrl = oModel.sServiceUrl || "";
                var sFullUrl = sServiceUrl + sPath;
                
                console.log("=== INDIVIDUAL REQUEST " + iItemNumber + " ===");
                console.log("Method: PUT");
                console.log("URL:", sFullUrl);
                console.log("Path:", sPath);
                console.log("Headers:", {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "DataServiceVersion": "2.0",
                    "X-Requested-With": "XMLHttpRequest",
                    "X-HTTP-Method": "PUT"
                });
                console.log("Payload:", JSON.stringify(oUpdateData, null, 2));
                console.log("Raw Payload:", oUpdateData);
                console.log("================================");
            },

            _updateLocalModel: function(aSelectedItems, sActionType) {
                var oTreeModel = this.getView().getModel("treeData");
                var aTreeData = oTreeModel.getData().treeData;
                var sStatus = sActionType === "APPROVE" ? "APPROVED" : "REJECTED";
                var sDefaultRemarks = sActionType === "APPROVE" ? "Approved via bulk action" : "Rejected via bulk action";
                
                // Update each selected item in local model
                aSelectedItems.forEach(function(oSelectedItem) {
                    // Find and update the item in tree data
                    for (var i = 0; i < aTreeData.length; i++) {
                        var oApproval = aTreeData[i];
                        
                        // Check if it's a header item
                        if (oApproval.ApprovalNo === oSelectedItem.ApprovalNo && 
                            oApproval.VendorCode === oSelectedItem.VendorCode && 
                            oSelectedItem.isHeader) {
                            // Update header and all its children
                            oApproval.OverallStatus = sStatus;
                            oApproval.children.forEach(function(oChild) {
                                oChild.PmApprStatus = sStatus;
                                // Use existing remarks from table or default
                                if (!oChild.PmApprRemarks || oChild.PmApprRemarks.trim() === "") {
                                    oChild.PmApprRemarks = sDefaultRemarks;
                                }
                                oChild.PmApprOn = new Date();
                            });
                            break;
                        } else {
                            // Check child items
                            for (var j = 0; j < oApproval.children.length; j++) {
                                var oItem = oApproval.children[j];
                                if (oItem.ApprovalNo === oSelectedItem.ApprovalNo && 
                                    oItem.ItemNum === oSelectedItem.ItemNum) {
                                    oItem.PmApprStatus = sStatus;
                                    // Use existing remarks from table or default
                                    if (!oItem.PmApprRemarks || oItem.PmApprRemarks.trim() === "") {
                                        oItem.PmApprRemarks = sDefaultRemarks;
                                    }
                                    oItem.PmApprOn = new Date();
                                    break;
                                }
                            }
                        }
                    }
                });
                
                // Refresh the model
                oTreeModel.setData({ treeData: aTreeData });
                
                // Clear selection
                this.byId("idTreeTable").clearSelection();
                this.getView().getModel("viewState").setProperty("/showBulkActions", false);
                
                console.log("Local model updated for bulk action:", {
                    ItemCount: aSelectedItems.length,
                    Action: sActionType,
                    Status: sStatus
                });
            },
            formatDialogStatusState: function (bIsHeader, sOverallStatus, sPmApprStatus) {
    // choose status based on header/item
    var sStatus = (bIsHeader ? sOverallStatus : sPmApprStatus) || "";
    sStatus = sStatus.trim().toUpperCase();

    // map your backend statuses to ValueState
    // change these values to match your actual statuses
    if (sStatus === "APPROVED" || sStatus === "APPROVE" || sStatus === "PM_APPR") {
        return "Success";
    }

    if (sStatus === "REJECTED" || sStatus === "REJECT" || sStatus === "PM_REJ") {
        return "Error";
    }

    if (sStatus === "PENDING" || sStatus === "INPROCESS" || sStatus === "IN PROCESS") {
        return "Warning";
    }

    return "None";
},

            formatDialogAmount: function (bIsHeader, sTotalAmount, sItemAmount, sCurrency) {
                var sAmount = bIsHeader ? sTotalAmount : sItemAmount;
                if (!sAmount || sAmount === "" || isNaN(parseFloat(sAmount))) {
                    return "₹0.00";
                }
                
                var numericValue = parseFloat(sAmount);
                return "₹" + numericValue.toLocaleString('en-IN', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                });
            },

            formatDialogStatusText: function (bIsHeader, sOverallStatus, sPmApprStatus) {
                return bIsHeader ? (sOverallStatus || "PENDING") : (sPmApprStatus || "PENDING");
            },


            // Formatter functions
            // Formatter functions
            formatter: {
                formatCurrency: function (value, showInLakhs) {
                    if (!value || value === "" || isNaN(parseFloat(value))) {
                        return "₹0.00";
                    }

                    var numericValue = parseFloat(value);
                    
                    if (showInLakhs) {
                        if (numericValue >= 100000) {
                            // Convert to lakhs (1 lakh = 100,000)
                            var lakhValue = numericValue / 100000;
                            return "₹" + lakhValue.toFixed(2) + "L";
                        } else if (numericValue >= 1000) {
                            // Show in thousands for smaller amounts
                            var thousandValue = numericValue / 1000;
                            return "₹" + thousandValue.toFixed(2) + "K";
                        } else {
                            // Show as is for very small amounts
                            return "₹" + numericValue.toFixed(2);
                        }
                    } else {
                        // Display in rupees with proper formatting
                        return "₹" + numericValue.toLocaleString('en-IN', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                        });
                    }
                },

                formatIndianCurrency: function (value) {
                    if (!value || value === "" || isNaN(value)) {
                        return "₹0.00";
                    }

                    var numericValue = parseFloat(value);
                    if (isNaN(numericValue)) {
                        return "₹0.00";
                    }

                    var displayValue = numericValue;
                    var suffix = "";

                    if (numericValue >= 100000) {
                        displayValue = numericValue / 100000;
                        suffix = "L";
                    } else if (numericValue >= 1000) {
                        displayValue = numericValue / 1000;
                        suffix = "K";
                    }

                    return "₹" + displayValue.toFixed(2) + suffix;
                },

                statusState: function (status) {
                    if (!status) return ValueState.None;
                    
                    switch (status.toUpperCase()) {
                        case "APPROVED":
                        case "COMPLETE":
                        case "SUCCESS":
                            return ValueState.Success;
                        case "REJECTED":
                        case "CANCELLED":
                        case "ERROR":
                            return ValueState.Error;
                        case "PENDING":
                        case "IN_PROCESS":
                        case "WARNING":
                            return ValueState.Warning;
                        case "INFORMATION":
                        case "INFO":
                            return ValueState.Information;
                        default:
                            return ValueState.None;
                    }
                }
            }
        });
    });