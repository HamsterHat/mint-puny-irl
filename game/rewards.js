const has=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
export function createRoundRewarder({enqueue,commit,syncAccount}){
  return ({gameId,awards})=>enqueue(()=>commit(database=>{
    if(typeof gameId!=='string'||!Array.isArray(awards))throw new Error('Некорректная выдача наград.');
    const result={};
    for(const award of awards){
      const account=has(database,award.username)?database[award.username]:null;
      if(!account)throw new Error(`Аккаунт не найден: ${award.username}`);
      if(!Number.isSafeInteger(award.coins)||award.coins<0)throw new Error('Некорректная сумма награды.');
      account.rewardedRounds??={};
      if(!account.rewardedRounds||typeof account.rewardedRounds!=='object'||Array.isArray(account.rewardedRounds))throw new Error('Повреждён журнал наград.');
      if(!has(account.rewardedRounds,gameId)){
        const balance=account.coins+award.coins;
        if(!Number.isSafeInteger(balance)||balance<0)throw new Error('Превышен допустимый баланс.');
        account.coins=balance;
        account.rewardedRounds[gameId]={coins:award.coins,outcome:award.outcome};
      }
      Object.defineProperty(result,award.username,{value:{...account.rewardedRounds[gameId],status:'paid'},enumerable:true,writable:true,configurable:true});
    }
    return result;
  },()=>{for(const award of awards)syncAccount(award.username);}));
}
