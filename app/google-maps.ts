import {importLibrary,setOptions} from "@googlemaps/js-api-loader";

let configured=false;
export function configureMaps(){
 const key=process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
 if(!key)throw new Error("El buscador de ubicaciones no está disponible en este momento.");
 if(!configured){setOptions({key,v:"weekly",language:"es"});configured=true;}
}
export async function placesLibrary(){configureMaps();return importLibrary("places");}
export async function mapLibraries(){configureMaps();return Promise.all([importLibrary("maps"),importLibrary("marker"),importLibrary("places")]);}
