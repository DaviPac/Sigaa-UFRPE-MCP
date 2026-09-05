// Port dos structs de models.go (sigaa-ufrpe-api) para uso no MCP.

export const FALTAS_INDEFINIDAS = -2;
export const PRESENCA_NAO_LANCADA = -1;

export interface TurmaInfo {
  nome: string;
  frontEndId: string;
  formName: string;
  componentId: string;
}

export interface ArquivoCronograma {
  nome: string;
  chave: string;
  id: string;
}

export interface CronogramaItem {
  titulo: string;
  conteudo: string;
  arquivos?: ArquivoCronograma[];
}

export interface Noticia {
  titulo: string;
  conteudo: string[];
}

export interface DisciplinaNotas {
  codigo: string;
  nome: string;
  notas: Record<string, string>;
  resultado: string;
  faltas: string;
  situacao: string;
}

export interface TurmaData {
  nome: string;
  local: string;
  horarios: string[];
  notas?: DisciplinaNotas;
  faltas: number;
  info: TurmaInfo;
  noticia?: Noticia;
  cronograma?: CronogramaItem[] | null;
}

export interface Avaliacao {
  nome: string;
  turmaNome: string;
  data: string;
  tipo: string;
}

export interface IndicesAcademicos {
  mc: string;
  ira: string;
  mcn: string;
  iech: string;
  iepl: string;
  iea: string;
  iean: string;
  iechp: string;
}

export interface CargasHorarias {
  optativaPendente: string;
  obrigatoriaPendente: string;
  complementarPendente: string;
  totalCurriculo: string;
}

export interface ComponenteCurricular {
  codigo: string;
  id: string;
  nome: string;
  cargaHoraria: string;
  tipo: string;
  nivel: string;
}

export interface EstruturaCurricular {
  codigo: string;
  matrizCurricular: string;
  periodoVigor: string;
  cargaHorariaTotalMin: string;
  cargaHorariaOptativaMin: string;
  cargaHorariaObrigatoria: string;
  prazoMinimoSemestres: string;
  prazoMedioSemestres: string;
  prazoMaximoSemestres: string;
  componentes: ComponenteCurricular[];
}

export interface DetalhesComponente {
  codigo: string;
  nome: string;
  tipo: string;
  modalidade: string;
  unidade: string;
  ementa: string;
  cargaHorariaTotal: string;
  preRequisitos: string[];
  equivalencias: string[];
}

export interface TurmaAtestado {
  codigo: string;
  nome: string;
  professor: string;
  local: string;
  tipo: string;
  status: string;
  horario: string;
}

export interface AtestadoMatricula {
  periodoLetivo: string;
  matricula: string;
  vinculo: string;
  nome: string;
  nivel: string;
  curso: string;
  turmas: TurmaAtestado[];
  codigoVerificacao: string;
}

export class SigaaError extends Error {}
export class InvalidCredentialsError extends SigaaError {
  constructor() {
    super("Usuário ou senha inválidos.");
  }
}
export class SessaoExpiradaError extends SigaaError {
  constructor(context?: string) {
    super(context ? `Sessão expirada ou inválida ao acessar ${context}.` : "Sessão expirada ou inválida.");
  }
}
