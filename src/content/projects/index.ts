export { ecosystem } from './ecosystem.ts';
import { projects } from './list.ts';

export const allProjects = projects;
export const projectById = new Map(projects.map((p) => [p.id, p]));
