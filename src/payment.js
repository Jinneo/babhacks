export const TOKEN='0xa9012a055bd4e0edff8ce09f960291c09d5322dc';
export const CHAIN=84532;
export const types={TransferWithAuthorization:[{name:'from',type:'address'},{name:'to',type:'address'},{name:'value',type:'uint256'},{name:'validAfter',type:'uint256'},{name:'validBefore',type:'uint256'},{name:'nonce',type:'bytes32'}]};
export const ABI=['function balanceOf(address) view returns(uint256)','function decimals() view returns(uint8)','function name() view returns(string)','function eip712Domain() view returns(bytes1,string,string,uint256,address,bytes32,uint256[])','function DOMAIN_SEPARATOR() view returns(bytes32)','function transfer(address,uint256) returns(bool)','function transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)'];
