import { Observable } from 'rxjs';
import { Network, convert, KeyPair, CryptoHelpers, Serialization, helpers, Address, TransactionTypes, Nodes } from "nem-utils";
import Wallet from "./wallet";
import NetworkRequests from "./networkRequests";

/** Service to build transactions */
class Transactions {
  wallet: Wallet;
  networkRequests: NetworkRequests;

  /**
   * Initialize services and properties
   *
   */
  constructor() {
    this.wallet = new Wallet();
    this.networkRequests = new NetworkRequests();

    // this._DataBridge = DataBridge;
  }

  /**
   * Set the network version
   *
   * @param {number} val - A version number (1 or 2)
   *
   * @return {number} - A network version
   */
  CURRENT_NETWORK_VERSION(val: number): number {
    if (this.wallet.network === Network.data.Mainnet.id) {
        return 0x68000000 | val;
    } else if (this.wallet.network === Network.data.Testnet.id) {
        return 0x98000000 | val;
    }
    return 0x60000000 | val;
  }

  /**
   * Create the common part of a transaction
   *
   * @param {number} txType - A type of transaction
   * @param {string} senderPublicKey - The sender public key
   * @param {number} timeStamp - A timestamp for the transation
   * @param {number} due - A deadline in minutes
   * @param {number} version - A network version
   *
   * @return {Object} - A common transaction object
   */
  CREATE_DATA(txtype: number, senderPublicKey: string, timeStamp: number, due: number, version: number): any {
    return {
        type: txtype,
        version: version || this.CURRENT_NETWORK_VERSION(1),
        signer: senderPublicKey,
        timeStamp: timeStamp,
        deadline: timeStamp + due * 60
    };
  }

  /**
   * Calculate fees for mosaics included in a transaction
   *
   * @param {number} multiplier - A quantity multiplier
   * @param {object} mosaics - A mosaicDefinitionMetaDataPair object
   * @param {array} attachedMosaics - An array of mosaics to send
   *
   * @return {number} - The fee amount for the mosaics in the transaction
   */
  calculateMosaicsFee(multiplier: number, mosaics: any, attachedMosaics: any[]): number {
    let totalFee: number = 0;
    let fee: number = 0;
    let supplyRelatedAdjustment: number = 0;
    for (let i = 0; i < attachedMosaics.length; i++) {
      let m: any = attachedMosaics[i];
      let mosaicName: string = helpers.mosaicIdToName(m.mosaicId);
      if (!(mosaicName in mosaics)) {
          return -1;
      }
      let mosaicDefinitionMetaDataPair: any = mosaics[mosaicName];
      let divisibilityProperties: any[] = mosaicDefinitionMetaDataPair.mosaicDefinition.properties
          .filter(w => w.name === "divisibility");
      let divisibility: number = divisibilityProperties.length === 1 ? ~~(divisibilityProperties[0].value) : 0;

      let supply: number = mosaicDefinitionMetaDataPair.supply;
      let quantity: number = m.quantity;
      // Small business mosaic fee
      if (supply <= 10000 && divisibility === 0) {
          fee = 1;
      } else {
        let maxMosaicQuantity: number = 9000000000000000;
        let totalMosaicQuantity: number = supply * Math.pow(10, divisibility)
        supplyRelatedAdjustment = Math.floor(0.8 * Math.log(maxMosaicQuantity / totalMosaicQuantity));
        let numNem: number = helpers.calcXemEquivalent(multiplier, quantity, supply, divisibility);
        // Using Math.ceil below because xem equivalent returned is sometimes a bit lower than it should
        // Ex: 150'000 of nem:xem gives 149999.99999999997
        fee = helpers.calcMinFee(Math.ceil(numNem));
      }
      totalFee += Math.max(1, fee - supplyRelatedAdjustment);
    }
    return Math.max(1, totalFee);
  }

  /**
   * Wrap a transaction in otherTrans
   *
   * @param {string} senderPublicKey - The sender public key
   * @param {object} innerEntity - The transaction entity to wrap
   * @param {number} due - The transaction deadline in minutes
   *
   * @return {object} - A [MultisigTransaction]{@link http://bob.nem.ninja/docs/#multisigTransaction} object
   */
  _multisigWrapper(senderPublicKey: string, innerEntity: any, due: number): any {
    // let d = new Date();
    // let timeStamp = Math.floor(this._DataBridge.networkTime) + Math.floor(d.getSeconds() / 10);
    let timeStamp: number = helpers.createNEMTimeStamp();
    let version: number = this.CURRENT_NETWORK_VERSION(1);
    let data: any = this.CREATE_DATA(TransactionTypes.MultisigTransaction, senderPublicKey, timeStamp, due, version);
    let custom: any = {
        fee: 6000000,
        otherTrans: innerEntity
    };
    let entity: any = Object.assign(data, custom);
    return entity;
  }


  /**
   * Prepare a transfer and create the object to serialize
   *
   * @param {object} common - A password/privateKey object
   * @param {object} tx - The transaction data
   * @param {object} mosaicsMetaData - The mosaicDefinitionMetaDataPair object
   *
   * @return {object} - A [TransferTransaction]{@link http://bob.nem.ninja/docs/#transferTransaction} object ready for serialization
   */
  prepareTransfer(common: any, tx: any, mosaicsMetaData: any): any {
    let kp: KeyPair = KeyPair.create(helpers.fixPrivateKey(common.privateKey));
    let actualSender: string = tx.isMultisig ? tx.multisigAccount.publicKey : kp.publicKey.toString();
    let recipientCompressedKey: string = tx.recipient.toString();
    let amount: number = Math.round(tx.amount * 1000000);
    let message: any = helpers.prepareMessage(common, tx);
    let due: number = this.wallet.network === Network.data.Testnet.id ? 60 : 24 * 60;
    let mosaics: any = tx.mosaics;
    let mosaicsFee: number = null
    if (!tx.mosaics) {
      mosaicsFee = null;
    } else {
      mosaicsFee = this.calculateMosaicsFee(amount, mosaicsMetaData, mosaics);
    }
    let entity: any = this._constructTransfer(actualSender, recipientCompressedKey, amount, message, due, mosaics, mosaicsFee);
    if (tx.isMultisig) {
      entity = this._multisigWrapper(kp.publicKey.toString(), entity, due);
    }

    return entity;
  }

  /***
   * Create a transaction object
   *
   * @param {string} senderPublicKey - The sender account public key
   * @param {string} recipientCompressedKey - The recipient account public key
   * @param {number} amount - The amount to send in micro XEM
   * @param {object} message - The message object
   * @param {number} due - The deadline in minutes
   * @param {array} mosaics - The array of mosaics to send
   * @param {number} mosaicFee - The fees for mosaics included in the transaction
   *
   * @return {object} - A [TransferTransaction]{@link http://bob.nem.ninja/docs/#transferTransaction} object
   */
  _constructTransfer(senderPublicKey: string, recipientCompressedKey: string, amount: number,
    message: any, due: number, mosaics: any[], mosaicsFee: number): any {
    // let d = new Date();
    // let timeStamp = Math.floor(this._DataBridge.networkTime) + Math.floor(d.getSeconds() / 10);
    let timeStamp: number = helpers.createNEMTimeStamp();
    let version: number = mosaics ? this.CURRENT_NETWORK_VERSION(2) : this.CURRENT_NETWORK_VERSION(1);
    let data: any = this.CREATE_DATA(TransactionTypes.Transfer, senderPublicKey, timeStamp, due, version);
    let msgFee: number = message.payload.length ? Math.max(1, Math.floor((message.payload.length / 2) / 32) + 1) : 0;
    let fee: number = mosaics ? mosaicsFee : helpers.calcMinFee(amount / 1000000);
    let totalFee: number = (msgFee + fee) * 1000000;
    let custom: any = {
        recipient: recipientCompressedKey.toUpperCase().replace(/-/g, ""),
        amount: amount,
        fee: totalFee,
        message: message,
        mosaics: mosaics
    };
    let entity: any = Object.assign(data, custom);
    return entity;
  }

  /**
   * Create an aggregate modification transaction object
   *
   * @param {object} tx - The transaction data
   * @param {array} signatoryArray - The cosignatories modifications array
   *
   * @return {object} - A [MultisigAggregateModificationTransaction]{@link http://bob.nem.ninja/docs/#multisigAggregateModificationTransaction} object
   */
  _constructAggregate(tx: any, signatoryArray: any[]): any {
    // let d = new Date();
    // let timeStamp = Math.floor(this._DataBridge.networkTime) + Math.floor(d.getSeconds() / 10);
    let timeStamp: number = helpers.createNEMTimeStamp();
    let version: number = this.CURRENT_NETWORK_VERSION(2);
    let due: number = this.wallet.network === Network.data.Testnet.id ? 60 : 24 * 60;
    let data: any = this.CREATE_DATA(TransactionTypes.MultisigModification, tx.multisigPubKey, timeStamp, due, version);
    let totalFee: number = (10 + 6 * signatoryArray.length + 6) * 1000000;
    let custom: any = {
      fee: totalFee,
      modifications: [],
      minCosignatories: {
        relativeChange: tx.minCosigs
      }
    };
    for (let i = 0; i < signatoryArray.length; i++) {
      custom.modifications.push({
        modificationType: 1,
        cosignatoryAccount: signatoryArray[i].pubKey
      });
    }

    // Sort modification array by addresses
    if (custom.modifications.length > 1) {
      custom.modifications.sort((a, b) => {
        if (Address.toAddress(a.cosignatoryAccount, this.wallet.network) < Address.toAddress(b.cosignatoryAccount, this.wallet.network)) return -1;
        if (Address.toAddress(a.cosignatoryAccount, this.wallet.network) > Address.toAddress(b.cosignatoryAccount, this.wallet.network)) return 1;
        return 0;
      });
    }

    let entity: any = Object.assign(data, custom);

    return entity;
  }

  /**
   * Create a multisignature aggregate modification transaction object
   *
   * @param {string} senderPublicKey - The sender account public key
   * @param {string} multisigPublicKey - The multisignature account public key
   * @param {array} signatoryArray: -The modification array of cosignatories
   *
   * @return {object} - A [MultisigCosignatoryModification]{@link http://bob.nem.ninja/docs/#multisigCosignatoryModification} object
   */
  _constructAggregateModifications(senderPublicKey: string, tx: any, signatoryArray: any[]): any {
    // let d = new Date();
    // let timeStamp = Math.floor(this._DataBridge.networkTime) + Math.floor(d.getSeconds() / 10);
    let timeStamp: number = helpers.createNEMTimeStamp();
    let version: number;
    let custom: any;
    let totalFee: number;
    let due: number = this.wallet.network === Network.data.Testnet.id ? 60 : 24 * 60;
    if (tx.minCosigs === null || tx.minCosigs === 0) {
      version = this.CURRENT_NETWORK_VERSION(1);
    } else {
      version = this.CURRENT_NETWORK_VERSION(2);
    }
    let data: any = this.CREATE_DATA(TransactionTypes.MultisigModification, tx.multisigPubKey, timeStamp, due, version);
    if (tx.minCosigs === null || tx.minCosigs === 0) {
      totalFee = (10 + 6 * signatoryArray.length) * 1000000;
      custom = {
          fee: totalFee,
          modifications: []
      };
    } else {
      totalFee = (10 + 6 * signatoryArray.length + 6) * 1000000;
      custom = {
        fee: totalFee,
        modifications: [],
        minCosignatories: {
            relativeChange: tx.minCosigs
        }
      };
    }
    for (let i = 0; i < signatoryArray.length; i++) {
      custom.modifications.push({
        modificationType: signatoryArray[i].type,
        cosignatoryAccount: signatoryArray[i].pubKey
      });
    }

    // Sort modification array by types then by addresses
    if (custom.modifications.length > 1) {
      custom.modifications.sort((a, b) => {
        return a.modificationType - b.modificationType || Address.toAddress(a.cosignatoryAccount, this.wallet.network).localeCompare(Address.toAddress(b.cosignatoryAccount, this.wallet.network));
      });
    }

    let entity: any = Object.assign(data, custom);
    entity = this._multisigWrapper(senderPublicKey, entity, due);
    return entity;
  }

    /**
     * Prepare a namespace provision transaction and create the object to serialize
     *
     * @param {object} common - A password/privateKey object
     * @param {object} tx - The transaction data
     *
     * @return {object} - A [ProvisionNamespaceTransaction]{@link http://bob.nem.ninja/docs/#provisionNamespaceTransaction} object ready for serialization
     */
    prepareNamespace(common: any, tx: any): any {
      let kp = KeyPair.create(helpers.fixPrivateKey(common.privateKey));
      let actualSender = tx.isMultisig ? tx.multisigAccount.publicKey : kp.publicKey.toString();
      let rentalFeeSink = tx.rentalFeeSink.toString();
      let rentalFee;
      // Set fee depending if namespace or sub
      if (tx.namespaceParent) {
        rentalFee = 200 * 1000000;
      } else {
        rentalFee = 5000 * 1000000;
      }
      let namespaceParent = tx.namespaceParent ? tx.namespaceParent.fqn : null;
      let namespaceName = tx.namespaceName.toString();
      let due = this.wallet.network === Network.data.Testnet.id ? 60 : 24 * 60;
      let entity = this._constructNamespace(actualSender, rentalFeeSink, rentalFee, namespaceParent, namespaceName, due);
      if (tx.isMultisig) {
        entity = this._multisigWrapper(kp.publicKey.toString(), entity, due);
      }
      return entity;
    }

  /***
   * Create a namespace provision transaction object
   *
   * @param {string} senderPublicKey - The sender account public key
   * @param {string} rentalFeeSink - The rental sink account
   * @param {number} rentalFee - The rental fee
   * @param {string} namespaceParent - The parent namespace
   * @param {string} namespaceName  - The namespace name
   * @param {number} due - The deadline in minutes
   *
   * @return {object} - A [ProvisionNamespaceTransaction]{@link http://bob.nem.ninja/docs/#provisionNamespaceTransaction} object
   */
  _constructNamespace(senderPublicKey: string, rentalFeeSink: string, rentalFee: number,
    namespaceParent: string, namespaceName: string, due: number): any {
    // let d = new Date();
    // let timeStamp = Math.floor(this._DataBridge.networkTime) + Math.floor(d.getSeconds() / 10);
    let timeStamp: number = helpers.createNEMTimeStamp();
    let version: number = this.CURRENT_NETWORK_VERSION(1);
    let data: any = this.CREATE_DATA(TransactionTypes.ProvisionNamespace, senderPublicKey, timeStamp, due, version);
    let fee: number = 20 * 1000000;
    let custom: any = {
      rentalFeeSink: rentalFeeSink.toUpperCase().replace(/-/g, ""),
      rentalFee: rentalFee,
      parent: namespaceParent,
      newPart: namespaceName,
      fee: fee
    };

    let entity: any = Object.assign(data, custom);
    return entity;
  }

  /**
   * Prepare a mosaic definition transaction and create the object to serialize
   *
   * @param {object} common - A password/privateKey object
   * @param {object} tx - The transaction data
   *
   * @return {object} - A [MosaicDefinitionCreationTransaction]{@link http://bob.nem.ninja/docs/#mosaicDefinitionCreationTransaction} object ready for serialization
   */
  prepareMosaicDefinition(common: any, tx: any): any {
    let kp: KeyPair = KeyPair.create(helpers.fixPrivateKey(common.privateKey));
    let actualSender: string = tx.isMultisig ? tx.multisigAccount.publicKey : kp.publicKey.toString();
    let rentalFeeSink: string = tx.mosaicFeeSink.toString();
    let rentalFee: number = 500 * 1000000;
    let namespaceParent: string = tx.namespaceParent.fqn;
    let mosaicName: string = tx.mosaicName.toString();
    let mosaicDescription: string = tx.mosaicDescription.toString();
    let mosaicProperties: any = tx.properties;
    let levy: any = tx.levy.mosaic ? tx.levy : null;
    let due: number = this.wallet.network === Network.data.Testnet.id ? 60 : 24 * 60;
    let entity: any = this._constructMosaicDefinition(actualSender, rentalFeeSink, rentalFee, namespaceParent, mosaicName, mosaicDescription, mosaicProperties, levy, due);
    if (tx.isMultisig) {
      entity = this._multisigWrapper(kp.publicKey.toString(), entity, due);
    }
    return entity;
  }

  /***
   * Create a mosaic definition transaction object
   *
   * @param {string} senderPublicKey: The sender account public key
   * @param {string} rentalFeeSink: The rental sink account
   * @param {number} rentalFee: The rental fee
   * @param {string} namespaceParent: The parent namespace
   * @param {string} mosaicName: The mosaic name
   * @param {string} mosaicDescription: The mosaic description
   * @param {object} mosaicProperties: The mosaic properties object
   * @param {object} levy: The levy object
   * @param {number} due: The deadline in minutes
   *
   * @return {object} - A [MosaicDefinitionCreationTransaction]{@link http://bob.nem.ninja/docs/#mosaicDefinitionCreationTransaction} object
   */
  _constructMosaicDefinition(senderPublicKey: string, rentalFeeSink: string, rentalFee: number,
      namespaceParent: string, mosaicName: string, mosaicDescription: string, mosaicProperties: any,
      levy: any, due: number): any {
    // let d = new Date();
    // let timeStamp = Math.floor(this._DataBridge.networkTime) + Math.floor(d.getSeconds() / 10);
    let timeStamp: number = helpers.createNEMTimeStamp();
    let version: number = this.CURRENT_NETWORK_VERSION(1);
    let data: any = this.CREATE_DATA(TransactionTypes.MosaicDefinition, senderPublicKey, timeStamp, due, version);

    let fee: number = 20 * 1000000;
    let levyData: any = levy ? {
      type: levy.feeType,
      recipient: levy.address.toUpperCase().replace(/-/g, ""),
      mosaicId: levy.mosaic,
      fee: levy.fee,
    } : null;
    let custom: any = {
      creationFeeSink: rentalFeeSink.replace(/-/g, ""),
      creationFee: rentalFee,
      mosaicDefinition: {
        creator: senderPublicKey,
        id: {
          namespaceId: namespaceParent,
          name: mosaicName,
        },
        description: mosaicDescription,
        properties: Object.keys(mosaicProperties).map(k => {
          return {
            name: k,
            value: mosaicProperties[k].toString()
          };
        }),
        levy: levyData
      },
      fee: fee
    };

    let entity: any = Object.assign(data, custom);
    return entity;
  }

  /**
   * Prepare a mosaic supply change transaction and create the object to serialize
   *
   * @param {object} common - A password/privateKey object
   * @param {object} tx - The transaction data
   *
   * @return {object} - A [MosaicSupplyChangeTransaction]{@link http://bob.nem.ninja/docs/#mosaicSupplyChangeTransaction} object ready for serialization
   */
  prepareMosaicSupply(common: any, tx: any): any {
    let kp: KeyPair = KeyPair.create(helpers.fixPrivateKey(common.privateKey));
    let actualSender: string = tx.isMultisig ? tx.multisigAccount.publicKey : kp.publicKey.toString();
    let due: number = this.wallet.network === Network.data.Testnet.id ? 60 : 24 * 60;
    let entity: any = this._constructMosaicSupply(actualSender, tx.mosaic, tx.supplyType, tx.delta, due);
    if (tx.isMultisig) {
      entity = this._multisigWrapper(kp.publicKey.toString(), entity, due);
    }
    return entity;
  }

  /***
   * Create a mosaic supply change transaction object
   *
   * @param {string} senderPublicKey - The sender account public key
   * @param {object} mosaicId - The mosaic id
   * @param {number} supplyType - The type of change
   * @param {number} delta - The amount involved in the change
   * @param {number} due - The deadline in minutes
   *
   * @return {object} - A [MosaicSupplyChangeTransaction]{@link http://bob.nem.ninja/docs/#mosaicSupplyChangeTransaction} object
   */
  _constructMosaicSupply(senderPublicKey: string, mosaicId: any,
      supplyType: number, delta: number, due: number): any {
    // let d = new Date();
    // let timeStamp = Math.floor(this._DataBridge.networkTime) + Math.floor(d.getSeconds() / 10);
    let timeStamp: number = helpers.createNEMTimeStamp();
    let version: number = this.CURRENT_NETWORK_VERSION(1);
    let data: any = this.CREATE_DATA(TransactionTypes.MosaicSupply, senderPublicKey, timeStamp, due, version);

    let fee: number = 20 * 1000000;
    let custom: any = {
      mosaicId: mosaicId,
      supplyType: supplyType,
      delta: delta,
      fee: fee
    };
    let entity: any = Object.assign(data, custom);
    return entity;
  }

  /**
   * Prepare an importance transfer transaction and create the object to serialize
   *
   * @param {object} common - A password/privateKey object
   * @param {object} tx - The transaction data
   *
   * @return {object} - An [ImportanceTransferTransaction]{@link http://bob.nem.ninja/docs/#importanceTransferTransaction} object ready for serialization
   */
  prepareImportanceTransfer(common: any, tx: any): any {
    let kp: KeyPair = KeyPair.create(helpers.fixPrivateKey(common.privateKey));
    let actualSender: string = tx.isMultisig ? tx.multisigAccount.publicKey : kp.publicKey.toString();
    let due: number = this.wallet.network === Network.data.Testnet.id ? 60 : 24 * 60;
    let entity: any = this._constructImportanceTransfer(actualSender, tx.remoteAccount, tx.mode, due);
    if (tx.isMultisig) {
      entity = this._multisigWrapper(kp.publicKey.toString(), entity, due);
    }
    return entity;
  }

  /***
   * Create an importance transfer transaction object
   *
   * @param {string} senderPublicKey - The sender account public key
   * @param {string} recipientKey - The remote account public key
   * @param {number} mode - The selected mode
   * @param {number} due - The deadline in minutes
   *
   * @return {object} - An [ImportanceTransferTransaction]{@link http://bob.nem.ninja/docs/#importanceTransferTransaction} object
   */
  _constructImportanceTransfer(senderPublicKey: string, recipientKey: string, mode: number, due: number): any {
    // let d = new Date();
    // let timeStamp = Math.floor(this._DataBridge.networkTime) + Math.floor(d.getSeconds() / 10);
    let timeStamp: number = helpers.createNEMTimeStamp();
    let version: number = this.CURRENT_NETWORK_VERSION(1);
    let data: any = this.CREATE_DATA(TransactionTypes.ImportanceTransfer, senderPublicKey, timeStamp, due, version);
    let custom: any = {
        remoteAccount: recipientKey,
        mode: mode,
        fee: 6000000
    };
    let entity: any = Object.assign(data, custom);
    return entity;
  }

  /**
   * Prepare an apostille transfer and create the object to serialize
   *
   * @param {object} common - A password/privateKey object
   * @param {object} tx - The transaction data
   *
   * @return {object} - A [TransferTransaction]{@link http://bob.nem.ninja/docs/#transferTransaction} object ready for serialization
   */
  prepareApostilleTransfer(common: any, tx: any): any {
    let kp: KeyPair = KeyPair.create(helpers.fixPrivateKey(common.privateKey));
    let actualSender: string = tx.isMultisig ? tx.multisigAccount.publicKey : kp.publicKey.toString();
    let recipientCompressedKey: string = tx.recipient.toString();
    // let amount: number = parseInt(tx.amount * 1000000, 10);
    let amount: number = tx.amount * 1000000;
    // Set the apostille file hash as hex message
    let message: any = {
      type: 1,
      payload: tx.message.toString()
    };
    let due: number = this.wallet.network === Network.data.Testnet.id ? 60 : 24 * 60;
    let mosaics: any = null;
    let mosaicsFee: number = null
    let entity: any = this._constructTransfer(actualSender, recipientCompressedKey, amount, message, due, mosaics, mosaicsFee);
    if (tx.isMultisig) {
      entity = this._multisigWrapper(kp.publicKey.toString(), entity, due);
    }

    return entity;
  }

  /**
   * Prepare a multisig signature transaction, create the object, serialize and broadcast
   *
   * @param {object} common - A password/privateKey object
   * @param {object} tx - The transaction data
   *
   * @return {promise} - An announce transaction promise of the NetworkRequests service
   */
  prepareSignature(common: any, tx: any): Observable<any> {
    let kp: KeyPair = KeyPair.create(helpers.fixPrivateKey(common.privateKey));
    let actualSender: string = kp.publicKey.toString();
    let otherAccount: string = tx.multisigAccountAddress.toString();
    let otherHash: string = tx.hash.toString();
    let due: number = this.wallet.network === Network.data.Testnet.id ? 60 : 24 * 60;
    let entity: any = this._constructSignature(actualSender, otherAccount, otherHash, due);
    let result: any = Serialization.serializeTransaction(entity);
    let signature: any = kp.sign(result);
    let obj: any = {
      data: convert.ua2hex(result),
      signature: signature.toString()
    };
    return this.networkRequests.announceTransaction(helpers.getHostname(this.wallet.node), obj);
  }

  /***
   * Create a multisig signature transaction object
   *
   * @param {string} senderPublicKey - The sender account public key
   * @param {string} otherAccount - The multisig account address
   * @param {string} otherHash - The inner transaction hash
   * @param {number} due - The deadline in minutes
   *
   * @return {object} - An [MultisigSignatureTransaction]{@link http://bob.nem.ninja/docs/#multisigSignatureTransaction} object
   */
  _constructSignature(senderPublicKey: string, otherAccount: string, otherHash: string, due: number): any {
  //     let d = new Date();
  //     let timeStamp = Math.floor(this._DataBridge.networkTime) + Math.floor(d.getSeconds() / 10);
    let timeStamp: number = helpers.createNEMTimeStamp();
    let version: number = this.CURRENT_NETWORK_VERSION(1);
    let data: any = this.CREATE_DATA(TransactionTypes.MultisigSignature, senderPublicKey, timeStamp, due, version);
    let totalFee: number = (2 * 3) * 1000000;
    let custom: any = {
      otherHash: {
        data: otherHash
      },
      otherAccount: otherAccount,
      fee: totalFee,
    };

    let entity: any = Object.assign(data, custom);

    return entity;
  }

  /**
   * Serialize a transaction and broadcast it to the network
   *
   * @param {object} entity - The prepared transaction object
   * @param {object} common - A password/privateKey object
   *
   * @return {promise} - An announce transaction promise of the NetworkRequests service
   */
  serializeAndAnnounceTransaction(entity: any, common: any): Observable<any> {
    let kp: KeyPair = KeyPair.create(helpers.fixPrivateKey(common.privateKey));
    let result: any = Serialization.serializeTransaction(entity);
    let signature: any = kp.sign(result);
    let obj: any = {
      data: convert.ua2hex(result),
      signature: signature.toString()
    };

    return this.networkRequests.announceTransaction(helpers.getHostname(this.wallet.node), obj);
  }

  /**
   * Serialize a transaction and broadcast it to the network (from a loop)
   *
   * @param {object} entity - The prepared transaction object
   * @param {object} common - A password/privateKey object
   * @param {anything} data - Any kind of data
   * @param {number} k - The position into the loop
   *
   * @return {promise} - An announce transaction promise of the NetworkRequests service, with isolated data
   */
  serializeAndAnnounceTransactionLoop(entity, common, data, k): Observable<any> {
    let kp: KeyPair = KeyPair.create(helpers.fixPrivateKey(common.privateKey));
    let result: any = Serialization.serializeTransaction(entity);
    let signature: any = kp.sign(result);
    let obj: any = {
      data: convert.ua2hex(result),
      signature: signature.toString()
    };

    return this.networkRequests.announceTransactionLoop(helpers.getHostname(this.wallet.node), obj, data, k);
  }
}

export default Transactions;
