import Image from 'next/image';

export default function BrandLogo({className=''}:{className?:string}) {
  return <Image unoptimized src="/brand/clikiss-full.webp" alt="ClicKiss — Citas para todxs" width={640} height={427} className={`clikiss-logo ${className}`}/>;
}
