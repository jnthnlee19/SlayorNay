export function normalizeHex(value) {
 const hex=String(value??'').trim().replace(/^#/,'');
 if(/^[a-f\d]{3}$/i.test(hex))return '#'+[...hex.toLowerCase()].map(c=>c+c).join('');
 return /^[a-f\d]{6}$/i.test(hex)?'#'+hex.toLowerCase():null;
}
export function normalizeOverride(value){
 const hex=normalizeHex(typeof value==='string'?value:value?.hex);
 const family=COLOR_FAMILIES.some(([key])=>key!=='unknown'&&key===value?.family)?value.family:null;
 return hex||family?{hex,family}:null;
}
export function effectiveHex(polish, overrides={}) {return normalizeOverride(overrides[polish.id])?.hex||normalizeHex(polish.swatch?.hex);}
export function effectiveFamily(polish, overrides={}) {return normalizeOverride(overrides[polish.id])?.family||colorInfo(effectiveHex(polish,overrides))?.family||'unknown';}
export function colorInfo(value) {
 const hex=normalizeHex(value);if(!hex)return null;
 const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
 const [r,g,b]=rgb,max=Math.max(...rgb),min=Math.min(...rgb),delta=max-min,lightness=(max+min)/2;
 const saturation=delta===0?0:delta/(1-Math.abs(2*lightness-1));
 let hue=delta===0?0:60*(max===r?((g-b)/delta)%6:max===g?(b-r)/delta+2:(r-g)/delta+4);hue=(hue+360)%360;
 const linear=rgb.map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
 const luminance=linear[0]*.2126+linear[1]*.7152+linear[2]*.0722;
 let family;
 if(lightness<.1)family='blacks';
 else if(lightness>.94||lightness>.87&&saturation<.16)family='whites';
 else if(saturation<.12)family='grays';
 else if(hue>=10&&hue<50&&lightness<.48)family='browns';
 else if(hue>=12&&hue<50&&saturation<.65&&lightness>=.48)family='nudes';
 else if(hue>=330||hue<12)family=lightness>.62?'pinks':'reds';
 else if(hue<45)family='oranges';
 else if(hue<70)family='yellows';
 else if(hue<165)family='greens';
 else if(hue<195)family='teals';
 else if(hue<260)family='blues';
 else if(hue<310)family='purples';
 else family='pinks';
 return {hex,hue,saturation,lightness,luminance,family,foreground:luminance>.179?'#000000':'#ffffff'};
}
export const COLOR_FAMILIES=[['reds','Reds'],['oranges','Oranges'],['yellows','Yellows'],['greens','Greens'],['teals','Teals'],['blues','Blues'],['purples','Purples'],['pinks','Pinks'],['browns','Browns'],['nudes','Nudes'],['whites','Whites'],['grays','Grays'],['blacks','Blacks'],['unknown','No color yet']];
