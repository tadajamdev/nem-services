import { Nodes } from "nem-utils";
import AppConstants from "./appConstants";

class Wallet {
  network: number;
  node: string;

  constructor() {
    this.network = AppConstants.defaultNetwork;
    this.node = Nodes.defaultMainnetNode;
  }
}

export default Wallet;
