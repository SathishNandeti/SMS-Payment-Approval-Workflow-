sap.ui.define([
    "sap/ui/core/UIComponent",
    "com/incresol/zpaymentworkflow/model/models"
], (UIComponent, models) => {
    "use strict";

    return UIComponent.extend("com.incresol.zpaymentworkflow.Component", {
        metadata: {
            manifest: "json",
            interfaces: [
                "sap.ui.core.IAsyncContentCreation"
            ]
        },

        init() {
            // call the base component's init function
            UIComponent.prototype.init.apply(this, arguments);

            // set the device model
            this.setModel(models.createDeviceModel(), "device");

            // Debug: Check if OData model was created from manifest
            var oModel = this.getModel();
            console.log("Component init - OData model from manifest:", oModel);
            
            if (oModel) {
                console.log("Model service URL:", oModel.sServiceUrl);
                console.log("Model metadata state:", oModel.getServiceMetadata() ? "loaded" : "not loaded");
            } else {
                console.warn("No OData model found in component after manifest processing");
            }

            // enable routing
            this.getRouter().initialize();
        }
    });
});