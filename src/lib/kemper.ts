import { getCollection } from 'astro:content';

export async function getRigStaticPaths() {
  return (await getCollection('kemperRigs')).map(({ id, data: rig }) => ({
    params: { slug: id },
    props: { rig },
  }));
}
