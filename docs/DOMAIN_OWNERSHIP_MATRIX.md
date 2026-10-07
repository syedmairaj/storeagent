# StoreAgent Domain Ownership Matrix

| Entity | Organization-owned | Store-owned | Location-aware | Variant-aware | Immutable/history-safe |
|---|---:|---:|---:|---:|---:|
| Organization | yes | no | no | no | current |
| OrganizationMember | yes | no | no | no | current/audited |
| Store | yes | yes | no | no | current |
| Location | yes | yes | yes | no | current |
| Product | yes | yes | no | no | current |
| ProductVariant | yes | yes | no | yes | current |
| ProviderBinding | yes | via canonical entity | maybe | maybe | current/audited |
| InventorySnapshot | yes | yes | yes | yes | yes |
| Order | yes | yes | maybe | no | yes |
| OrderItem | yes | yes | maybe | yes | yes |
| ReturnRefund | yes | yes | maybe | yes | yes |
| Supplier | yes | maybe | no | no | current |
| SupplierProduct | yes | maybe | no | yes | current/history where needed |
| PurchaseOrder | yes | yes | maybe | no | history-safe |
| PurchaseOrderItem | yes | yes | maybe | yes | history-safe |
| SkuDailyMetric | yes | yes | yes | yes | yes |
| ForecastRun | yes | yes | maybe | no | yes |
| SkuForecast | yes | yes | maybe | yes | yes |
| InventoryAction | yes | yes | yes | yes | yes |
| ActionEvent | yes | yes | yes | yes | append-only |
| DataQualityIssue | yes | yes/maybe | maybe | maybe | history-safe |
| Integration | yes | yes/maybe | no | no | audited |
| SyncRun | yes | yes/maybe | no | no | yes |
| NotificationPreference | yes | maybe | no | no | current |
| BillingEntitlement | yes | no | no | no | current/audited |
