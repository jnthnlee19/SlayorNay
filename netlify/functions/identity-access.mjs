// Provider-supported denial hook. App APIs also check live protected metadata,
// so a token issued before suspension cannot bypass the access restriction.
export default {
 userLogin(event){
  if(event.user.appMetadata?.gloss_or_toss_suspended===true)return event.deny();
 }
};
