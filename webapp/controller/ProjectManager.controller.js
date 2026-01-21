sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast"
], function (Controller, JSONModel, MessageToast) {
    "use strict";

    return Controller.extend("com.incresol.zpaymentworkflow.controller.ProjectManager", {

        onInit: function () {
            // Initialize models
            var oViewStateModel = new JSONModel({
                showBulkActions: false,
                selectedCount: 0
            });
            this.getView().setModel(oViewStateModel, "viewState");

            var oTreeDataModel = new JSONModel({ treeData: [] });
            this.getView().setModel(oTreeDataModel, "treeData");

            // Load data
            this._waitForModelAndLoadData();
        },

        _waitForModelAndLoadData: function() {
            var oModel = this.getView().getModel();
            
            if (oModel && oModel.getServiceMetadata()) {
                this._loadPaymentData();
            } else if (oModel) {
                oModel.attachMetadataLoaded(function() {
                    this._loadPaymentData();
                }.bind(this));
            } else {
                setTimeout(function() {
                    this._waitForModelAndLoadData();
                }.bind(this), 1000);
            }
        },

        _loadPaymentData: function () {
            var oModel = this.getView().getModel();
            
            if (!oModel) {
                MessageToast.show("OData service not available");
                return;
            }

            var that = this;
            oModel.read("/PaymentItemSet", {
                success: function (oData) {
                    if (oData.results && oData.results.length > 0) {
                        that._transformItemDataToTree(oData.results);
                        MessageToast.show("Payment data loaded: " + oData.results.length + " items");
                    } else {
                        MessageToast.show("No payment data available");
                        that.getView().getModel("treeData").setData({ treeData: [] });
                    }
                },
                error: function (oError) {
                    MessageToast.show("Error loading payment data");
                    that.getView().getModel("treeData").setData({ treeData: [] });
                }
            });
        },

        _transformItemDataToTree: function (aPaymentItems) {
            var oGroupedData = {};
            
            aPaymentItems.forEach(function (oItem) {
                var sApprovalNo = oItem.ApprovalNo;
                
                if (!oGroupedData[sApprovalNo]) {
                    oGroupedData[sApprovalNo] = {
                        ApprovalNo: sApprovalNo,
                        VendorNumber: oItem.VendorNumber,
                        VendorName: oItem.VendorName,
                        displayText: "Approval: " + sApprovalNo + " - " + oItem.VendorName,
                        isHeader: true,
                        serialNumber: 0,
                        TotalInvoiceAmt: 0,
                        TotalLiability: 0,
                        children: []
                    };
                }
                
                var oTreeItem = Object.assign({}, oItem, {
                    displayText: "Item " + oItem.ItemNum + " - " + oItem.VendorName,
                    isHeader: false,
                    serialNumber: 0
                });
                
                oGroupedData[sApprovalNo].children.push(oTreeItem);
                oGroupedData[sApprovalNo].TotalInvoiceAmt += parseFloat(oItem.InvoiceAmt || 0);
                oGroupedData[sApprovalNo].TotalLiability += parseFloat(oItem.TotalLiability || 0);
            });

            var aTreeData = Object.keys(oGroupedData).map(function (sKey) {
                return oGroupedData[sKey];
            });

            var iSerialNumber = 1;
            aTreeData.forEach(function(oApproval) {
                oApproval.serialNumber = iSerialNumber++;
                oApproval.children.forEach(function(oItem) {
                    oItem.serialNumber = iSerialNumber++;
                });
            });

            this.getView().getModel("treeData").setData({ treeData: aTreeData });
        },

        onTreeTableRowSelectionChange: function (oEvent) {
            var oTable = oEvent.getSource();
            var aSelectedIndices = oTable.getSelectedIndices();
            var oViewStateModel = this.getView().getModel("viewState");
            
            var bHasSelection = aSelectedIndices.length > 0;
            oViewStateModel.setProperty("/showBulkActions", bHasSelection);
            oViewStateModel.setProperty("/selectedCount", aSelectedIndices.length);
            
            if (bHasSelection) {
                MessageToast.show(aSelectedIndices.length + " item(s) selected");
            }
        },

        onTreeTableToggleOpenState: function (oEvent) {
            // Handle tree node expand/collapse
        },

        onApproveSelectedButtonPress: function () {
            var oTable = this.byId("idPaymentTreeTable");
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
            
            if (aSelectedItems.length === 1) {
                this._showItemApprovalDialog(aSelectedItems[0]);
            } else {
                this._showBulkActionDialog(aSelectedItems, "APPROVE");
            }
        },

        onRejectSelectedButtonPress: function () {
            var oTable = this.byId("idPaymentTreeTable");
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
            
            if (aSelectedItems.length === 1) {
                this._showItemRejectionDialog(aSelectedItems[0]);
            } else {
                this._showBulkActionDialog(aSelectedItems, "REJECT");
            }
        },

        _showBulkActionDialog: function (aSelectedItems, sActionType) {
            var oDialogModel = new JSONModel({
                selectedItems: aSelectedItems,
                totalCount: aSelectedItems.length,
                actionType: sActionType,
                confirmButtonText: sActionType === "APPROVE" ? "Approve All" : "Reject All",
                confirmButtonType: sActionType === "APPROVE" ? "Accept" : "Reject",
                remarks: ""
            });
            
            // Get or create bulk dialog
            if (!this._bulkDialog) {
                this._bulkDialog = this.byId("idBulkActionDialog");
            }
            
            this._bulkDialog.setModel(oDialogModel, "bulkDialog");
            this._bulkDialog.open();
        },

        onConfirmButtonTextButtonPress: function () {
            var oDialogModel = this._bulkDialog.getModel("bulkDialog");
            var oData = oDialogModel.getData();
            
            // Validate for rejection
            if (oData.actionType === "REJECT" && (!oData.remarks || oData.remarks.trim() === "")) {
                MessageToast.show("Please enter a rejection reason");
                return;
            }
            
            // Process bulk action
            this._processBulkAction(oData.selectedItems, oData.actionType, oData.remarks);
            
            // Clear selection and close dialog
            this.byId("idPaymentTreeTable").clearSelection();
            this.getView().getModel("viewState").setProperty("/showBulkActions", false);
            this._bulkDialog.close();
            
            MessageToast.show(oData.totalCount + " items " + (oData.actionType === "APPROVE" ? "approved" : "rejected") + " successfully");
        },

        onCancelButtonPress: function () {
            // Close any open dialog
            if (this._bulkDialog && this._bulkDialog.isOpen()) {
                this._bulkDialog.close();
            }
            if (this._approvalDialog && this._approvalDialog.isOpen()) {
                this._approvalDialog.close();
            }
            if (this._rejectionDialog && this._rejectionDialog.isOpen()) {
                this._rejectionDialog.close();
            }
            if (this._totalApprovalDialog && this._totalApprovalDialog.isOpen()) {
                this._totalApprovalDialog.close();
            }
            if (this._totalRejectionDialog && this._totalRejectionDialog.isOpen()) {
                this._totalRejectionDialog.close();
            }
        },

        onTreeTableToggleOpenState: function (oEvent) {
            // Handle tree node expand/collapse
        },

        _showItemApprovalDialog: function (oItemData) {
            // Create dialog model with item data
            var oDialogModel = new JSONModel({
                ApprovalNo: oItemData.ApprovalNo,
                ItemNum: oItemData.ItemNum,
                VendorName: oItemData.VendorName,
                InvoiceAmt: oItemData.InvoiceAmt,
                remarks: "",
                originalItem: oItemData
            });
            
            // Get or create dialog
            if (!this._approvalDialog) {
                this._approvalDialog = this.byId("idApprovalDialog");
            }
            
            this._approvalDialog.setModel(oDialogModel, "approvalDialog");
            this._approvalDialog.open();
        },

        _showItemRejectionDialog: function (oItemData) {
            // Create dialog model with item data
            var oDialogModel = new JSONModel({
                ApprovalNo: oItemData.ApprovalNo,
                ItemNum: oItemData.ItemNum,
                VendorName: oItemData.VendorName,
                InvoiceAmt: oItemData.InvoiceAmt,
                remarks: "",
                originalItem: oItemData
            });
            
            // Get or create dialog
            if (!this._rejectionDialog) {
                this._rejectionDialog = this.byId("idRejectionDialog");
            }
            
            this._rejectionDialog.setModel(oDialogModel, "rejectionDialog");
            this._rejectionDialog.open();
        },

        _showTotalApprovalDialog: function (oApprovalData) {
            // Calculate total amount and item count
            var iTotalAmount = 0;
            var iItemCount = oApprovalData.children.length;
            
            oApprovalData.children.forEach(function(oItem) {
                iTotalAmount += parseFloat(oItem.InvoiceAmt || 0);
            });
            
            // Create dialog model with approval data
            var oDialogModel = new JSONModel({
                ApprovalNo: oApprovalData.ApprovalNo,
                itemCount: iItemCount,
                totalAmount: iTotalAmount.toFixed(2),
                remarks: "",
                originalApproval: oApprovalData
            });
            
            // Get or create dialog
            if (!this._totalApprovalDialog) {
                this._totalApprovalDialog = this.byId("idTotalApprovalDialog");
            }
            
            this._totalApprovalDialog.setModel(oDialogModel, "totalApprovalDialog");
            this._totalApprovalDialog.open();
        },

        _showTotalRejectionDialog: function (oApprovalData) {
            // Calculate total amount and item count
            var iTotalAmount = 0;
            var iItemCount = oApprovalData.children.length;
            
            oApprovalData.children.forEach(function(oItem) {
                iTotalAmount += parseFloat(oItem.InvoiceAmt || 0);
            });
            
            // Create dialog model with approval data
            var oDialogModel = new JSONModel({
                ApprovalNo: oApprovalData.ApprovalNo,
                itemCount: iItemCount,
                totalAmount: iTotalAmount.toFixed(2),
                remarks: "",
                originalApproval: oApprovalData
            });
            
            // Get or create dialog
            if (!this._totalRejectionDialog) {
                this._totalRejectionDialog = this.byId("idTotalRejectionDialog");
            }
            
            this._totalRejectionDialog.setModel(oDialogModel, "totalRejectionDialog");
            this._totalRejectionDialog.open();
        },

        onApproveButtonPress: function () {
            var oDialogModel = this._approvalDialog.getModel("approvalDialog");
            var oData = oDialogModel.getData();
            
            // Process individual item approval
            this._processApproval(oData, "APPROVED");
            
            this._approvalDialog.close();
            MessageToast.show("Item approved successfully");
        },

        onRejectButtonPress: function () {
            var oDialogModel = this._rejectionDialog.getModel("rejectionDialog");
            var oData = oDialogModel.getData();
            
            // Validate rejection reason
            if (!oData.remarks || oData.remarks.trim() === "") {
                MessageToast.show("Please enter a rejection reason");
                return;
            }
            
            // Process individual item rejection
            this._processApproval(oData, "REJECTED");
            
            this._rejectionDialog.close();
            MessageToast.show("Item rejected successfully");
        },

        onApproveAllItemsButtonPress: function () {
            var oDialogModel = this._totalApprovalDialog.getModel("totalApprovalDialog");
            var oData = oDialogModel.getData();
            
            // Process all items approval
            this._processTotalApproval(oData, "APPROVED");
            
            this._totalApprovalDialog.close();
            MessageToast.show("All line items approved successfully");
        },

        onRejectAllItemsButtonPress: function () {
            var oDialogModel = this._totalRejectionDialog.getModel("totalRejectionDialog");
            var oData = oDialogModel.getData();
            
            // Validate rejection reason
            if (!oData.remarks || oData.remarks.trim() === "") {
                MessageToast.show("Please enter a rejection reason");
                return;
            }
            
            // Process all items rejection
            this._processTotalApproval(oData, "REJECTED");
            
            this._totalRejectionDialog.close();
            MessageToast.show("All line items rejected successfully");
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
                        oApproval.VendorNumber === oSelectedItem.VendorNumber && 
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
            
            console.log("Bulk action processed:", {
                ItemCount: aSelectedItems.length,
                Action: sActionType,
                Status: sStatus,
                Remarks: sRemarks
            });
        },

        _processApproval: function (oApprovalData, sStatus) {
            // This method would typically make an OData call to update the approval status
            // For now, we'll just update the local model
            
            var oTreeModel = this.getView().getModel("treeData");
            var aTreeData = oTreeModel.getData().treeData;
            
            // Find and update the item in the tree data
            for (var i = 0; i < aTreeData.length; i++) {
                var oApproval = aTreeData[i];
                for (var j = 0; j < oApproval.children.length; j++) {
                    var oItem = oApproval.children[j];
                    if (oItem.ApprovalNo === oApprovalData.ApprovalNo && 
                        oItem.ItemNum === oApprovalData.ItemNum) {
                        
                        // Update the item status based on current user role
                        // This is a simplified example - you'd determine the role dynamically
                        oItem.PmApprStatus = sStatus;
                        oItem.PmApprRemarks = oApprovalData.remarks;
                        break;
                    }
                }
            }
            
            // Refresh the model
            oTreeModel.setData({ treeData: aTreeData });
            
            console.log("Individual approval processed:", {
                ApprovalNo: oApprovalData.ApprovalNo,
                ItemNum: oApprovalData.ItemNum,
                Status: sStatus,
                Remarks: oApprovalData.remarks
            });
        },

        _processTotalApproval: function (oApprovalData, sStatus) {
            // This method would typically make an OData call to update all items
            // For now, we'll just update the local model
            
            var oTreeModel = this.getView().getModel("treeData");
            var aTreeData = oTreeModel.getData().treeData;
            
            // Find and update all items in the approval
            for (var i = 0; i < aTreeData.length; i++) {
                var oApproval = aTreeData[i];
                if (oApproval.ApprovalNo === oApprovalData.ApprovalNo) {
                    // Update all child items
                    for (var j = 0; j < oApproval.children.length; j++) {
                        var oItem = oApproval.children[j];
                        oItem.PmApprStatus = sStatus;
                        oItem.PmApprRemarks = oApprovalData.remarks;
                    }
                    break;
                }
            }
            
            // Refresh the model
            oTreeModel.setData({ treeData: aTreeData });
            
            console.log("Total approval processed:", {
                ApprovalNo: oApprovalData.ApprovalNo,
                ItemCount: oApprovalData.itemCount,
                Status: sStatus,
                Remarks: oApprovalData.remarks
            });
        },

        // Formatter functions
        formatter: {
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

            formatStatusState: function (status) {
                if (!status) return "None";
                
                switch (status.toUpperCase()) {
                    case "APPROVED":
                    case "COMPLETE":
                    case "SUCCESS":
                        return "Success";
                    case "REJECTED":
                    case "CANCELLED":
                    case "ERROR":
                        return "Error";
                    case "PENDING":
                    case "IN_PROCESS":
                    case "WARNING":
                        return "Warning";
                    case "INFORMATION":
                    case "INFO":
                        return "Information";
                    default:
                        return "None";
                }
            }
        }
    });
});