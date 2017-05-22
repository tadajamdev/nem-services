import * as fetch from "isomorphic-fetch";
import * as querystring from "querystring";
import { Nodes, Network } from "nem-utils";
import AppConstants from "./appConstants";
import Wallet from "./wallet";

import { Observable } from 'rxjs';
import 'rxjs/add/operator/map';

/** Service containing various API requests */
class NetworkRequests {

  wallet: Wallet;

  /**
  * Initialize services and properties
  */
  constructor() {
    this.wallet = new Wallet();
  }

  /**
   * Get port from network
   */
  getPort(): number {
      return this.wallet.network === Network.data.Mijin.id ? AppConstants.defaultMijinPort : AppConstants.defaultNisPort;
  }

  /**
   * Gets the current height of the block chain.
   *
   * @param {string} host - An host ip or domain
   *
   * @return {number} - The current height on chosen endpoint
   */
  getHeight(host: string): Observable<number> {
    let url: string = "http://" + host + ":" + this.getPort() + "/chain/height";


    return Observable.fromPromise(fetch(url))
      .flatMap(response => response.json())
      .map(json => json.height);
  }


  /**
   * Gets the AccountMetaDataPair of an account.
   *
   * @param {string} host - An host ip or domain
   * @param {string} address - An account address
   *
   * @return {object} - An [AccountMetaDataPair]{@link http://bob.nem.ninja/docs/#accountMetaDataPair} object
   */
  getAccountData(host: string, address: string): Observable<any> {
    let url: string = "http://" + host + ":" + this.getPort() + "/account/get";
    let obj: {address: string} = {address: address};

    return Observable.fromPromise(fetch(url + "?" + querystring.stringify(obj)))
      .flatMap(response => response.json());
  }

  /**
   * Gets an array of harvest info objects for an account.
   *
   * @param {string} host - An host ip or domain
   * @param {string} address - An account address
   *
   * @return {array} - An array of [HarvestInfo]{@link http://bob.nem.ninja/docs/#harvestInfo} objects
   */
  getHarvestedBlocks(host: string, address: string): Observable<any> {
    let url: string = "http://" + host + ":" + this.getPort() + "/account/harvests";
    let obj: {address: string} = {address: address};

    return Observable.fromPromise(fetch(url + "?" + querystring.stringify(obj)))
      .flatMap(response => response.json());
  }


  /**
   * Gets the namespace with given id.
   *
   * @param {string} host - An host ip or domain
   * @param {string} id - A namespace id
   *
   * @return {object} - A [NamespaceInfo]{@link http://bob.nem.ninja/docs/#namespace} object
   */
  getNamespacesById(host: string, id: string): Observable<any> {
    let url: string = "http://" + host + ":" + this.getPort() + "/namespace";
    let obj: {namespace: string} = {namespace: id};

    return Observable.fromPromise(fetch(url + "?" + querystring.stringify(obj)))
      .flatMap(response => response.json());
  }

  /**
   * Gets an array of TransactionMetaDataPair objects where the recipient has the address given as parameter to the request.
   *
   * @param {string} host - An host ip or domain
   * @param {string} address - An account address
   * @param {string} txHash - A starting hash for search (optional)
   * @param {number} id - The transaction id up to which transactions are returned.(optional)
   *
   * @return {array} - An array of [TransactionMetaDataPair]{@link http://bob.nem.ninja/docs/#transactionMetaDataPair} objects
   */
  getIncomingTxes(host: string, address: string, txHash: string, id: number): Observable<any> {
    let url: string = "http://" + host + ":" + this.getPort() + "/account/transfers/incoming";
    let obj: {address: string, hash: string, id?: number};
    if(id) {
      obj = {address: address, hash: txHash, id: id};
    } else {
      obj = {address: address, hash: txHash};
    }

    return Observable.fromPromise(fetch(url + "?" + querystring.stringify(obj)))
      .flatMap(response => response.json());
  }

   /**
   * Gets the array of transactions for which an account is the sender or receiver and which have not yet been included in a block.
   *
   * @param {string} host - An host ip or domain
   * @param {string} address - An account address
   *
   * @return {array} - An array of [UnconfirmedTransactionMetaDataPair]{@link http://bob.nem.ninja/docs/#unconfirmedTransactionMetaDataPair} objects
   */
  getUnconfirmedTxes(host: string, address: string): Observable<any> {
    let url: string = "http://" + host + ":" + this.getPort() + "/account/unconfirmedTransactions";
    let obj: {address: string} = {address: address};

    return Observable.fromPromise(fetch(url + "?" + querystring.stringify(obj)))
      .flatMap(response => response.json());
  }

  /**
   * Audit an apostille file
   *
   * @param {string} publicKey - The signer public key
   * @param {string} data - The file data of audited file
   * @param {string} signedData - The signed data into the apostille transaction message
   *
   * @return {boolean} - True if valid, false otherwise
   */
  auditApostille(publicKey: string, data: string, signedData: string): Observable<boolean> {
    let url: string = Nodes.apostilleAuditServer;

    let obj: {
      publicKey: string,
      data: string,
      signedData: string
    } = {
      publicKey: publicKey,
      data: data,
      signedData: signedData
    };

    let req: {
      method: string,
      headers: any,
      body: any
    } = {
     method: "POST",
     headers: {
       "Content-Type": "application/x-www-form-urlencoded;"
     },
     body: obj
    };

    return Observable.fromPromise(fetch(url, req))
      .flatMap(res => res.json());
  }

  /**
   * Gets information about the maximum number of allowed harvesters and how many harvesters are already using the node
   *
   * @param {string} host - An host ip or domain
   *
   * @return {object} - An [UnlockInfo]{@link http://bob.nem.ninja/docs/#retrieving-the-unlock-info} object
   */
  getUnlockedInfo(host: string): Observable<any> {
    let url: string = "http://" + host + ":" + this.getPort() + "/account/unlocked/info";
    let req: {
      method: string,
      headers: any,
      body: any
    } = {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: ""
    };

    return Observable.fromPromise(fetch(url, req))
      .flatMap(res => res.json());
  }

  /**
   * Unlocks an account (starts harvesting).
   *
   * @param {string} host - An host ip or domain
   * @param {string} privateKey - A delegated account private key
   *
   * @return -
   */
  unlockAccount(host: string, privateKey: string): Observable<any> {
    let url: string = "http://" + host + ":" + this.getPort() + "/account/unlock";
    let req: {
      method: string,
      headers: any,
      body: any
    } = {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: {"value": privateKey}
    };

    return Observable.fromPromise(fetch(url, req));
  }


   /**
   * Locks an account (stops harvesting).
   *
   * @param {string} host - An host ip or domain
   * @param {string} privateKey - A delegated account private key
   *
   * @return -
   */
  lockAccount(host: string, privateKey: string): Observable<any> {
    let url: string = "http://" + host + ":" + this.getPort() + "/account/lock";
    let req: {
      method: string,
      headers: any,
      body: any
    } = {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: {"value": privateKey}
    };

    return Observable.fromPromise(fetch(url, req));
  }


  /**
   * Gets nodes of the node reward program
   *
   * @return {array} - An array of SuperNodeData objects
   */
  getSupernodes(): Observable<any> {
    let url: string = "https://supernodes.nem.io/nodes";

    return Observable.fromPromise(fetch(url))
      .flatMap(response => response.json());
  };

  /**
   * Gets market information from Poloniex api
   *
   * @return {object} - A MarketInfo object
   */
  getMarketInfo(): Observable<any> {
    let url: string = "https://poloniex.com/public?command=returnTicker";

    return Observable.fromPromise(fetch(url))
      .flatMap(response => response.json())
      .map(json => json["BTC_XEM"]);
  }

  /**
   * Gets BTC price from blockchain.info API
   *
   * @return {object} - A MarketInfo object
   */
  getBtcPrice(): Observable<any> {
    let url: string = "https://blockchain.info/ticker";
    let obj: {cors: boolean} = {cors: true};

    return Observable.fromPromise(fetch(url + "?" + querystring.stringify(obj)))
      .flatMap(response => response.json())
      .map(json => json["USD"]);
  }

  /**
   * Gets a TransactionMetaDataPair object from the chain using it's hash
   *
   * @param {string} host - An host ip or domain
   * @param {string} txHash - A transaction hash
   *
   * @return {object} - A [TransactionMetaDataPair]{@link http://bob.nem.ninja/docs/#transactionMetaDataPair} object
   */
  getTxByHash(host: string, txHash: string): Observable<any> {
    let url: string = "http://" + host + ":" + this.getPort() + "/transaction/get";
    let obj: {hash: string} = {hash: txHash};

    return Observable.fromPromise(fetch(url + "?" + querystring.stringify(obj)))
      .flatMap(response => response.json());
  }

  /**
   * Determines if NIS is up and responsive.
   *
   * @param {string} host - An host ip or domain
   *
   * @return {object} - A [NemRequestResult]{@link http://bob.nem.ninja/docs/#nemRequestResult} object
   */
  heartbeat(host: string): Observable<any> {
    let url: string = "http://" + host + ":" + this.getPort() + "/heartbeat";

    return Observable.fromPromise(fetch(url))
      .flatMap(response => response.json());
  }

  /**
   * Gets the AccountMetaDataPair of the account for which the given account is the delegate account
   *
   * @param {string} host - An host ip or domain
   * @param {string} address - An account address
   *
   * @return {object} - An [AccountMetaDataPair]{@link http://bob.nem.ninja/docs/#accountMetaDataPair} object
   */
  getForwarded(host: string, address: string): Observable<any> {
    let url: string = "http://" + host + ":" + this.getPort() + "/account/get/forwarded";
    let obj: {address: string} = {address: address};

    return Observable.fromPromise(fetch(url + "?" + querystring.stringify(obj)))
      .flatMap(response => response.json());
  }

  /**
   * Broadcast a transaction to the NEM network
   *
   * @param {string} host - An host ip or domain
   * @param {object} obj - A RequestAnnounce object
   *
   * @return {object} - A [NemAnnounceResult]{@link http://bob.nem.ninja/docs/#nemAnnounceResult} object
   */
  announceTransaction(host: string, obj: any): Observable<any> {
    let url: string = "http://" + host + ":" + this.getPort() + "/transaction/announce";
    let req: {
      method: string,
      headers: any,
      body: any
    } = {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(obj)
    };

    return Observable.fromPromise(fetch(url, req))
      .flatMap(response => response.json());
  }

  /**
   * Broadcast a transaction to the NEM network and return isolated data
   *
   * @param {string} host - An host ip or domain
   * @param {object} obj - A RequestAnnounce object
   * @param {anything} data - Any kind of data
   * @param {number} k - The position into the loop
   *
   * @return {object} - A [NemAnnounceResult]{@link http://bob.nem.ninja/docs/#nemAnnounceResult} object with loop data and k to isolate them into the callback.
   */
  announceTransactionLoop(host: string, obj: any, data: any, k: number): Observable<any> {
    let url: string = "http://" + host + ":" + this.getPort() + "/transaction/announce";
    let req: {
      method: string,
      headers: any,
      body: any
    } = {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: obj
    };

    return Observable.fromPromise(fetch(url, req))
      .map(response => {
        let r: {res: any, tx: any, k: number} = {res: response, tx: data, k: k};
        return r;
      });
  }

  /**
   * Gets root namespaces.
   *
   * @param {string} host - An host ip or domain
   * @param {number|null} id - The namespace id up to which root namespaces are returned, null for most recent
   *
   * @return {object} - An array of [NamespaceMetaDataPair]{@link http://bob.nem.ninja/docs/#namespaceMetaDataPair} objects
   */
  getNamespaces(host: string, id: number): Observable<any> {
    let url: string = "http://" + host + ":" + this.getPort() + "/namespace/root/page";
    let obj: {pageSize: number, id?: number};
    if(id) {
      obj = {pageSize: 100, id: id};
    } else {
      obj = {pageSize: 100};
    }

    return Observable.fromPromise(fetch(url + "?" + querystring.stringify(obj)))
      .flatMap(response => response.json());
  }

  /**
   * Gets sub-namespaces of a parent namespace
   *
   * @param {string} host - An host ip or domain
   * @param {string} address - An account address
   * @param {string} parent - The namespace parent
   *
   * @return {object} - An array of [NamespaceMetaDataPair]{@link http://bob.nem.ninja/docs/#namespaceMetaDataPair} objects
   */
  getSubNamespaces(host: string, address: string, parent: string): Observable<any> {
    let url: string = "http://" + host + ":" + this.getPort() + "/account/namespace/page";
    let obj: {address: string, parent: string} = {address: address, parent: parent};

    return Observable.fromPromise(fetch(url + "?" + querystring.stringify(obj)))
      .flatMap(response => response.json());
  }

  /**
   * Gets mosaics of a parent namespace
   *
   * @param {string} host - An host ip or domain
   * @param {string} address - An account address
   * @param {string} parent - The namespace parent
   *
   * @return {object} - An array of [MosaicDefinition]{@link http://bob.nem.ninja/docs/#mosaicDefinition} objects
   */
  getMosaics(host: string, address: string, parent: string): Observable<any> {
    let url: string = "http://" + host + ":" + this.getPort() + "/account/mosaic/definition/page";
    let obj: {address: string, parent: string} = {address: address, parent: parent};

    return Observable.fromPromise(fetch(url + "?" + querystring.stringify(obj)))
      .flatMap(response => response.json());
  }

  /**
   * Gets all mosaics definitions of an account
   *
   * @param {string} host - An host ip or domain
   * @param {string} address - An account address
   *
   * @return {array} - An array of [MosaicDefinition]{@link http://bob.nem.ninja/docs/#mosaicDefinition} objects
   */
  getMosaicsDefinitions(host: string, address: string): Observable<any> {
    let url: string = "http://" + host + ":" + this.getPort() + "/account/mosaic/owned/definition";
    let obj: {address: string} = {address: address};

    return Observable.fromPromise(fetch(url + "?" + querystring.stringify(obj)))
      .flatMap(response => response.json());
  }

  /**
   * Gets all transactions of an account
   *
   * @param {string} host - An host ip or domain
   * @param {string} address - An account address
   * @param {string} txHash - A starting hash (optional)
   *
   * @return {array} - An array of [TransactionMetaDataPair]{@link http://bob.nem.ninja/docs/#transactionMetaDataPair} objects
   */
  getAllTransactions(host: string, address: string, txHash: string): Observable<any> {
    let url: string = "http://" + host + ":" + this.getPort() + "/account/transfers/all";
    let obj: {address: string, hash: string} = {address: address, hash: txHash};

    return Observable.fromPromise(fetch(url + "?" + querystring.stringify(obj)))
      .flatMap(response => response.json());
  }

  /**
   * Get network time in ms
   *
   * @param {string} host - An host ip or domain
   *
   * @return {object} - A [communicationTimeStamps]{@link http://bob.nem.ninja/docs/#communicationTimeStamps} object
   */
  getNEMTime(host: string): Observable<any> {
    let url: string = "http://" + host + ":" + this.getPort() + "/time-sync/network-time";

    return Observable.fromPromise(fetch(url))
      .flatMap(response => response.json());
  }

  /**
   * Gets mosaics of a parent namespace
   *
   * @param {string} host - An host ip or domain
   * @param {string} id - The full mosaic id
   *
   * @return {object} - An array of [MosaicDefinition]{@link http://bob.nem.ninja/docs/#mosaicDefinition} objects
   */
  getOtherMosaic(host: string, id: string): Observable<any> {
    let url: string = "http://" + host + ":" + this.getPort() + "/namespace/mosaic/definition/page";
    let obj: {namespace: string} = {namespace: id};

    return Observable.fromPromise(fetch(url + "?" + querystring.stringify(obj)))
      .flatMap(response => response.json());
  }
}

export default NetworkRequests;
