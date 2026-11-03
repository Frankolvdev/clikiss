export async function api<T>(path:string,options:RequestInit={}):Promise<T>{
 const response=await fetch(`/api/v1/${path}`,{...options,credentials:'same-origin',cache:'no-store',headers:{...(options.body instanceof FormData?{}:{'Content-Type':'application/json'}),...options.headers}});
 if(!response.ok){if(response.status===401)window.dispatchEvent(new Event('conecta-auth-required'));const error=await response.json().catch(()=>null);throw new Error(error?.message??'No se pudo completar la solicitud.');}
 return response.json();
}
export function send<T>(path:string,data:unknown,method='POST'){return api<T>(path,{method,body:JSON.stringify(data)});}
