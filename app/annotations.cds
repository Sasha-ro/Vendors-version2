using CatalogService as service from '../srv/cat-service';

annotate service.Vendors with @(
    UI.FieldGroup #General : {
        $Type : 'UI.FieldGroupType',
        Data : [
            {
                $Type : 'UI.DataField',
                Label : 'name',
                Value : name,
            }
        ]
    },
    UI.Facets : [
        {
            $Type : 'UI.ReferenceFacet',
            ID : 'GeneralInfo',
            Label : 'General Information',
            Target : '@UI.FieldGroup#General',
        }
    ],
    UI.LineItem : [
        {
            $Type : 'UI.DataField',
            Label : 'name',
            Value : name,
        },
        {
            $Type : 'UI.DataFieldForAction',
            Action : 'CatalogService.vendorReviews',
            Label : 'Get vendor reviews',
            Inline : true,
        },
        {
            $Type : 'UI.DataFieldForAction',
            Action : 'CatalogService.EntityContainer/countEntities',
            Label : 'Count Entities',
        }
    ]
);

