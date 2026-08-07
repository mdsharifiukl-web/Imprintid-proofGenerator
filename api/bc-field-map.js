// Business Central field mapping — EDIT THIS once you hear back on the
// business-central-api-request.md document.
//
// "Item Color" and "Imprint Method" are not standard Business Central
// fields, so we can't know their real API property names in advance. This
// file is the one place you tell the server what to actually call them.
// No other code needs to change — just update the values below and restart
// the server.
//
// HOW TO FILL THIS IN:
// Your BC partner/IT team will tell you the exact JSON property name each
// custom field appears as when you call the Sales Order API (this is NOT
// necessarily the same as the field's on-screen label in Business Central —
// ask specifically for the "API field name" or look at a sample API
// response / the API's $metadata).
//
// Example: if the API response for a sales order line looks like:
//   { "itemNumber": "TM30SID", "lineDetails_ImprintMethod": "Screen Print", ... }
// then imprintMethodField below should be 'lineDetails_ImprintMethod'.

module.exports = {
  // Where do these custom fields live? Almost always they're on the sales
  // order LINE (one per item/color on the order), not the order header —
  // leave this as 'line' unless your BC partner tells you otherwise.
  customFieldsOn: 'line', // 'line' | 'header'

  // The exact API/JSON property names for each custom field.
  // Leave a value as an empty string '' if that field doesn't exist in BC —
  // ImprintID will just leave that field blank for the person to fill in
  // manually, instead of failing the whole lookup.
  itemColorField: 'itemColor',
  imprintMethodField: 'imprintMethod',
  specialRequestField: 'specialRequest',

  // If your BC partner built a completely separate custom API page for
  // these fields (rather than adding them to the standard Sales Order API),
  // put its path here instead — e.g. 'contoso/promo/v1.0'. Leave blank to
  // use the standard API (api/v2.0), which is the common case.
  customApiPath: ''
};
