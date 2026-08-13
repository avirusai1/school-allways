/**
 * CBSE-style HPC domain/indicator starter set.
 * Schools will not author 60 indicators by hand — seed once per branch.
 */

export interface HpcIndicatorTemplate {
  code: string;
  statement: string;
  levels: string[];
}

export interface HpcDomainTemplate {
  code: string;
  name: string;
  description: string;
  stage: string;
  sequence: number;
  indicators: HpcIndicatorTemplate[];
}

const LEVELS = ['beginner', 'progressing', 'proficient', 'advanced'];

export const CBSE_HPC_TEMPLATE: HpcDomainTemplate[] = [
  {
    code: 'cognitive',
    name: 'Cognitive',
    description: 'Thinking, reasoning, and knowledge application',
    stage: 'middle',
    sequence: 1,
    indicators: [
      {
        code: 'cog_reason',
        statement: 'Explains reasoning clearly when solving problems',
        levels: LEVELS,
      },
      {
        code: 'cog_apply',
        statement: 'Applies classroom learning to new situations',
        levels: LEVELS,
      },
      {
        code: 'cog_inquiry',
        statement: 'Asks purposeful questions and pursues answers',
        levels: LEVELS,
      },
    ],
  },
  {
    code: 'socio_emotional',
    name: 'Socio-emotional',
    description: 'Self-awareness, empathy, and collaboration',
    stage: 'middle',
    sequence: 2,
    indicators: [
      {
        code: 'se_collab',
        statement: 'Works constructively in group tasks',
        levels: LEVELS,
      },
      {
        code: 'se_empathy',
        statement: 'Shows empathy and respect for peers',
        levels: LEVELS,
      },
      {
        code: 'se_regulate',
        statement: 'Manages emotions appropriately in school settings',
        levels: LEVELS,
      },
    ],
  },
  {
    code: 'language',
    name: 'Language',
    description: 'Listening, speaking, reading, and writing',
    stage: 'middle',
    sequence: 3,
    indicators: [
      {
        code: 'lang_express',
        statement: 'Expresses ideas clearly in oral and written form',
        levels: LEVELS,
      },
      {
        code: 'lang_listen',
        statement: 'Listens attentively and responds appropriately',
        levels: LEVELS,
      },
    ],
  },
  {
    code: 'creative',
    name: 'Creative & aesthetic',
    description: 'Imagination, arts, and design thinking',
    stage: 'middle',
    sequence: 4,
    indicators: [
      {
        code: 'cre_imagine',
        statement: 'Shows originality in creative tasks',
        levels: LEVELS,
      },
      {
        code: 'cre_present',
        statement: 'Presents work with care and aesthetic sense',
        levels: LEVELS,
      },
    ],
  },
  {
    code: 'physical',
    name: 'Physical development',
    description: 'Health, movement, and wellbeing',
    stage: 'middle',
    sequence: 5,
    indicators: [
      {
        code: 'phy_participate',
        statement: 'Participates actively in physical activities',
        levels: LEVELS,
      },
      {
        code: 'phy_habits',
        statement: 'Follows healthy habits and safety practices',
        levels: LEVELS,
      },
    ],
  },
];
