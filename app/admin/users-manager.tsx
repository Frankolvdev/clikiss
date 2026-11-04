"use client";
import {useEffect,useMemo,useRef,useState} from 'react';
import DataTable,{Column,type DataTableRef} from 'datatables.net-react';
import DtCore from 'datatables.net-dt';
import type {Options} from 'datatables.net';
import UserEditor,{type EditorState} from './user-editor';
import 'datatables.net-dt/css/dataTables.dataTables.css';
import './users-manager.css';

// DataTables' library registration API is named `use`; it is not a React hook.
// eslint-disable-next-line react-hooks/rules-of-hooks
DataTable.use(DtCore);
export type ManagedUser={id:string;name:string;email:string;verified:boolean;created_at:string;suspended_at:string|null;role:string|null;location:string;gender:string;bio:string;version:string;synthetic:boolean};
const roles:Record<string,string>={none:'Sin rol',admin:'Administrador',moderator:'Moderador',support:'Soporte'};
export default function UsersManager({role,userId,version,onAction,onSelfChange}:{role:string;userId:string;version:number;onAction:(value:Record<string,unknown>)=>void;onSelfChange:(revoked:boolean)=>Promise<void>}){
 const table=useRef<DataTableRef>(null),pending=useRef<AbortController|null>(null);
 const [filters,setFilters]=useState({role:'all',status:'all',verification:'all'}),[error,setError]=useState(''),[notice,setNotice]=useState(''),[editor,setEditor]=useState<EditorState|null>(null);
 const currentFilters=useRef(filters);
 const options=useMemo<Options>(()=>({
  serverSide:true,processing:true,pageLength:25,lengthMenu:[10,25,50,100],order:[[5,'desc']],searchDelay:350,autoWidth:false,scrollX:true,
  language:{search:'Buscar:',searchPlaceholder:'Nombre o correo',lengthMenu:'Mostrar _MENU_ usuarios',info:'Mostrando _START_ a _END_ de _TOTAL_ usuarios',infoEmpty:'Sin usuarios que mostrar',infoFiltered:'(de _MAX_ usuarios en total)',zeroRecords:'No hay usuarios para estos filtros.',emptyTable:'No hay usuarios registrados.',processing:'Cargando usuarios…',loadingRecords:'Cargando…',paginate:{first:'Primera',last:'Última',next:'Siguiente',previous:'Anterior'}},
  ajax:async(data,callback)=>{
   pending.current?.abort();const controller=new AbortController();pending.current=controller;
   const request=data as {draw:number;start:number;length:number;search:{value:string};order:{column:number;dir:string}[]};
   const params=new URLSearchParams({draw:String(request.draw),start:String(request.start),length:String(request.length),'search[value]':request.search.value,'order[0][column]':String(request.order[0]?.column??5),'order[0][dir]':request.order[0]?.dir??'desc',...currentFilters.current});
   try{const response=await fetch(`/api/v1/admin/user-management?${params}`,{credentials:'same-origin',cache:'no-store',signal:controller.signal});const result=await response.json();if(!response.ok)throw new Error(result.message??'No se pudieron cargar los usuarios.');setError('');callback(result);}
   catch(err){if(controller.signal.aborted)return;setError((err as Error).message);callback({draw:request.draw,recordsTotal:0,recordsFiltered:0,data:[]});}
  },
 }),[]);
 useEffect(()=>{table.current?.dt()?.ajax.reload(undefined,false);},[version]);
 useEffect(()=>{currentFilters.current=filters;table.current?.dt()?.ajax.reload();},[filters]);
 useEffect(()=>()=>pending.current?.abort(),[]);
 function filter(field:keyof typeof filters,label:string,choices:Record<string,string>){return <label>{label}<select value={filters[field]} onChange={event=>setFilters(current=>({...current,[field]:event.target.value}))}>{Object.entries(choices).map(([value,text])=><option key={value} value={value}>{text}</option>)}</select></label>;}
 async function saved(result:{self:boolean;sessionRevoked:boolean}){setEditor(null);setNotice('Cambios guardados correctamente.');table.current?.dt()?.ajax.reload(undefined,false);if(result.self)await onSelfChange(result.sessionRevoked);}
 return <section className="admin-users" aria-label="Gestión de usuarios">
  <div className="users-toolbar"><p>Busca, filtra y gestiona las cuentas de la comunidad.</p>{role==='admin'&&<button className="user-primary" onClick={()=>{setNotice('');setEditor({action:'create'});}}>Registrar usuario</button>}</div>
  <div className="users-filters">{filter('status','Estado',{all:'Todos los estados',active:'Activos',suspended:'Suspendidos'})}{filter('verification','Correo',{all:'Todos los correos',verified:'Confirmados',pending:'Sin confirmar'})}{filter('role','Rol',{all:'Todos los roles',...roles})}</div>
  {error&&<p className="admin-error" role="alert">{error}</p>}{notice&&<p className="users-success" role="status">{notice}</p>}
  <DataTable ref={table} options={options} className="display users-table">
   <Column data="name" title="Nombre">{(value:string,_type:string,row:ManagedUser)=><span className="user-name">{value}{row.synthetic&&<small>Cuenta de prueba</small>}</span>}</Column>
   <Column data="email" title="Correo">{(value:string)=><span>{value}</span>}</Column>
   <Column data="role" title="Rol">{(value:string|null)=><span>{roles[value??'none']??value}</span>}</Column>
   <Column data="verified" title="Correo confirmado">{(value:boolean)=><span className={`user-badge ${value?'positive':''}`}>{value?'Confirmado':'Pendiente'}</span>}</Column>
   <Column data="suspended_at" title="Estado">{(value:string|null)=><span className={`user-badge ${value?'negative':'positive'}`}>{value?'Suspendido':'Activo'}</span>}</Column>
   <Column data="created_at" title="Registro">{(value:string)=><time dateTime={value}>{new Date(value).toLocaleDateString('es-MX')}</time>}</Column>
   <Column data={null} title="Acciones" options={{orderable:false,searchable:false}}>{(_value:unknown,_type:string,row:ManagedUser)=><div className="user-row-actions">
    {role==='admin'&&<><button aria-label={`Editar a ${row.name}`} onClick={()=>setEditor({action:'edit',user:row})}>Editar</button><button aria-label={`Cambiar contraseña de ${row.name}`} onClick={()=>setEditor({action:'password',user:row})}>Contraseña</button></>}
    {role==='admin'&&row.id!==userId&&<button className="user-danger" aria-label={`Eliminar a ${row.name}`} onClick={()=>setEditor({action:'delete',user:row})}>Eliminar</button>}
    {role!=='support'&&row.id!==userId&&(role==='admin'||!row.role)&&<button onClick={()=>onAction({action:row.suspended_at?'restore':'suspend',userId:row.id})}>{row.suspended_at?'Restaurar cuenta':'Suspender cuenta'}</button>}
    {role==='admin'&&row.id!==userId&&<select aria-label={`Cambiar rol de ${row.name}`} value={row.role??'none'} onChange={event=>onAction({action:'role',userId:row.id,role:event.target.value})}>{Object.entries(roles).map(([value,text])=><option key={value} value={value}>{text}</option>)}</select>}
    {role==='support'&&<span>Solo consulta</span>}
   </div>}</Column>
  </DataTable>
  {editor&&<UserEditor key={`${editor.action}-${editor.user?.id??'new'}`} editor={editor} onClose={()=>setEditor(null)} onSaved={result=>void saved(result)}/>}
 </section>;
}
