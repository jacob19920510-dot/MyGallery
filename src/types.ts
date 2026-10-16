export type Block={type:string;text:string;url?:string};
export type Picture={id:string;work_id:string;relative_path:string;original_filename:string;width:number;height:number;byte_size:number;sha256:string};
export type Tag={id:string;name:string;count?:number;total_count?:number};
export type Work={id:string;title:string;description:Block[];artwork_date:string;created_at:string;updated_at:string;is_favorite:number;status:string;deleted_at:string|null;cover_image_id:string;cover_path?:string;image_count?:number;categories:string[];tags:Tag[];images?:Picture[]};
export type Group={id:string;name:string;sort_order:number};
export type Category={id:string;name:string;group_id:string;count:number};
export type Catalog={groups:Group[];categories:Category[];tags:Tag[];stats:{total:number;favorites:number;drafts:number;trash:number;images:number;bytes:number;root:string}};
