# nem-services
NEM's NanoWallet Services

NanoWallet version 1.3.4

* network-requests.service.ts
* transactions.service.ts

I have not verified it enough, so be careful when using it.

### Install
```sh
npm install nem-services
```

### Usage
```typescript
import { NetworkRequests } from "nem-services";

let networkRequests = new NetworkRequests();
console.log(networkRequests.getPort());
```
