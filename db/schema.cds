namespace my.vendors;

entity Vendors {
  key ID       : UUID;
      name     : String(100);
      address  : String(200);
      reviews : String(500);
      products : Association to many Products on products.vendor_ID = $self.ID;

}

entity Products {
    key ID        : UUID;
      name      : String(100);
      price     : Decimal(9,2);
      discount  : Decimal(5,2);
      vendor_ID : UUID;
      vendor    : Association to Vendors on vendor.ID = vendor_ID;
      actualPrice : Decimal(9,2) @cds.persistence.skip;
}
