using {my.vendors as db} from '../db/schema';

// Unbound action to count Vendors and Products
type EntityCounts : {
  vendorCount  : Integer;
  productCount : Integer;
};

service CatalogService {
  // Project only scalar fields for Vendors to avoid projection of to-many association
  entity Vendors  as
    projection on db.Vendors {
      ID,
      name,
      reviews
    }
    actions {
      // Bound action to get a short review for a vendor (returns plain text)
      action vendorReviews() returns String;
    };

  // Expose Products (includes vendor association which is to-one)
  entity Products as projection on db.Products;

  action countEntities() returns EntityCounts;
}
