export const PHOTO_CONSENT_VERSION='2026-09-10-v1';
export const PHOTO_CONSENT='I took this photo and own its copyright. I give Gloss or Toss nonexclusive, worldwide, royalty-free permission to reproduce, crop, edit, display, and share it on its website, app, downloadable product share cards that users may share, social media, and advertising promoting Gloss or Toss. I retain ownership of my photo.';
export function photoFilename(p){const label=(p.brand+'-'+p.name).normalize('NFKD').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80);return p.id+'--'+label+'.jpg';}
export function matchPhotoFilename(filename,products){const stem=filename.replace(/\.(jpe?g|png|webp)$/i,'');return products.find(p=>stem===p.id||stem.startsWith(p.id+'--'))||null;}
