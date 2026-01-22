sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/ui/core/ValueState",
    "sap/m/MessageBox"
], function (Controller, JSONModel, MessageToast, ValueState, MessageBox) {
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
            var oModel = this.getView().getModel();
            
            if (!oModel) {
                console.log("OData model not available");
                MessageToast.show("OData service not available");
                return;
            }

            console.log("Loading payment data from PaymentHeaderSet and PaymentItemSet...");
            var that = this;
            
            // Load both PaymentHeaderSet and PaymentItemSet
            Promise.all([
                new Promise(function(resolve, reject) {
                    oModel.read("/PaymentHeaderSet", {
                        success: resolve,
                        error: reject
                    });
                }),
                new Promise(function(resolve, reject) {
                    oModel.read("/PaymentItemSet", {
                        success: resolve,
                        error: reject
                    });
                })
            ]).then(function(results) {
                var oHeaderData = results[0];
                var oItemData = results[1];
                
                console.log("PaymentHeaderSet loaded:", oHeaderData.results.length, "headers");
                console.log("PaymentItemSet loaded:", oItemData.results.length, "items");
                
                // Debug: Log the actual header data
                if (oHeaderData.results && oHeaderData.results.length > 0) {
                    console.log("Sample PaymentHeaderSet data:", oHeaderData.results[0]);
                }
                
                // Always try to use PaymentHeaderSet first
                if (oHeaderData.results && oHeaderData.results.length > 0) {
                    console.log("Using PaymentHeaderSet for headers");
                    that._transformHeaderItemDataToTree(oHeaderData.results, oItemData.results);
                    MessageToast.show("Payment data loaded: " + oHeaderData.results.length + " headers with " + oItemData.results.length + " items");
                } else if (oItemData.results && oItemData.results.length > 0) {
                    console.log("PaymentHeaderSet empty, creating header structure from PaymentItemSet");
                    that._createHeaderStructureFromItems(oItemData.results);
                    MessageToast.show("Payment data loaded: " + oItemData.results.length + " items (headers created from items)");
                } else {
                    console.log("No payment data found");
                    MessageToast.show("No payment data available");
                    that.getView().getModel("treeData").setData({ treeData: [] });
                }
            }).catch(function(oError) {
                console.error("Error loading payment data:", oError);
                MessageToast.show("Error loading payment data");
                that.getView().getModel("treeData").setData({ treeData: [] });
            });
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
            
            if (aSelectedIndices.length === 0) {
                MessageToast.show("Please select items to reject");
                return;
            }
            
            var aSelectedItems = [];
            aSelectedIndices.forEach(function(iIndex) {
                var oContext = oTable.getContextByIndex(iIndex);
                if (oContext) {
                    aSelectedItems.push(oContext.getObject());
                }
            });
            
            this._openApprovalDialog(aSelectedItems, "REJECT");
        },

        _openApprovalDialog: function (aSelectedItems, sActionType) {
            var sDialogTitle = sActionType === "APPROVE" ? "Approve Items" : "Reject Items";
            var bRemarksRequired = sActionType === "REJECT";
            
            // Simple MessageBox for now to test
            var sMessage = "You have selected " + aSelectedItems.length + " items for " + sActionType.toLowerCase() + ".\n\n";
            sMessage += "Items:\n";
            aSelectedItems.forEach(function(item, index) {
                sMessage += (index + 1) + ". " + item.ApprovalNo + " - " + item.VendorName + " (" + item.InvoiceAmt + " " + item.Currency + ")\n";
            });
            
            if (bRemarksRequired) {
                sMessage += "\nNote: Remarks will be required for rejection.";
            }
            
            var that = this;
            MessageBox.confirm(sMessage, {
                title: sDialogTitle,
                onClose: function (oAction) {
                    if (oAction === MessageBox.Action.OK) {
                        if (bRemarksRequired) {
                            // For rejection, ask for remarks
                            that._askForRemarks(aSelectedItems, sActionType);
                        } else {
                            // For approval, proceed directly
                            that._processBulkAction(aSelectedItems, sActionType, "Approved via bulk action");
                        }
                    }
                }
            });
        },
        
        _askForRemarks: function(aSelectedItems, sActionType) {
            var that = this;
            var sMessage = "Please enter remarks for rejection:";
            
            MessageBox.show(sMessage, {
                icon: MessageBox.Icon.QUESTION,
                title: "Enter Remarks",
                actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
                emphasizedAction: MessageBox.Action.OK,
                initialFocus: "OK",
                details: "Remarks are mandatory for rejection of payment items.",
                onClose: function (oAction) {
                    if (oAction === MessageBox.Action.OK) {
                        // For now, use a default remark - in real implementation, you'd get this from an input
                        var sRemarks = "Rejected via bulk action - " + new Date().toLocaleString();
                        that._processBulkAction(aSelectedItems, sActionType, sRemarks);
                    }
                }
            });
        },

        _processBulkAction: function (aSelectedItems, sActionType, sRemarks) {
            var oTreeModel = this.getView().getModel("treeData");
            var aTreeData = oTreeModel.getData().treeData;
            var sStatus = sActionType === "APPROVE" ? "APPROVED" : "REJECTED";
            
            // Update each selected item
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
                            oChild.PmApprRemarks = sRemarks;
                        });
                        break;
                    } else {
                        // Check child items
                        for (var j = 0; j < oApproval.children.length; j++) {
                            var oItem = oApproval.children[j];
                            if (oItem.ApprovalNo === oSelectedItem.ApprovalNo && 
                                oItem.ItemNum === oSelectedItem.ItemNum) {
                                oItem.PmApprStatus = sStatus;
                                oItem.PmApprRemarks = sRemarks;
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
            
            MessageToast.show(aSelectedItems.length + " items " + (sActionType === "APPROVE" ? "approved" : "rejected") + " successfully");
            
            console.log("Bulk action processed:", {
                ItemCount: aSelectedItems.length,
                Action: sActionType,
                Status: sStatus,
                Remarks: sRemarks
            });
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