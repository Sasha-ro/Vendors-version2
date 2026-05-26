sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"project1/test/integration/pages/VendorsList",
	"project1/test/integration/pages/VendorsObjectPage"
], function (JourneyRunner, VendorsList, VendorsObjectPage) {
    'use strict';

    var runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('project1') + '/test/flp.html#app-preview',
        pages: {
			onTheVendorsList: VendorsList,
			onTheVendorsObjectPage: VendorsObjectPage
        },
        async: true
    });

    return runner;
});

