import type { PromptEntry } from './prompt-types';

export const ROLE_MODEL_PRESETS_VERSION = 1;

const presentation = '适用于电商服装展示，姿态舒展自然，表情放松自信。真实商业摄影质感，保留自然肤质、发丝和正确的人体比例，不过度磨皮。如有服装参考图，保持服装款式、面料、颜色、图案及细节一致；画面不添加文字或水印。';

// Editable examples, inserted once under All. Stable IDs preserve user edits,
// custom categories and cover associations without re-adding deleted records.
export const roleModelPresets: PromptEntry[] = [
  {
    id: 'v57-role-model-asian-female',
    name: '亚洲女性',
    content: '一位25–35岁的亚洲成年女性时装模特，黑色齐肩直发，自然偏暖肤色，淡妆，五官协调，身形匀称。',
  },
  {
    id: 'v57-role-model-white-female',
    name: '欧美白人女性',
    content: '一位25–35岁的欧美白人成年女性时装模特，浅棕色中长微卷发，白皙肤色并保留少量自然雀斑，淡妆，身形匀称。',
  },
  {
    id: 'v57-role-model-latina-female',
    name: '拉美裔女性',
    content: '一位25–35岁的拉美裔成年女性时装模特，深棕色锁骨长度微卷发，自然浅棕肤色，棕色眼睛，淡妆，身形匀称。',
  },
  {
    id: 'v57-role-model-black-female',
    name: '黑人女性',
    content: '一位25–35岁的黑人成年女性时装模特，自然蓬松的短卷发，深棕肤色并保留真实肤色层次，淡妆，身形匀称。',
  },
  {
    id: 'v57-role-model-asian-male',
    name: '亚洲男性',
    content: '一位25–35岁的亚洲成年男性时装模特，黑色自然短发，自然偏暖肤色，面部干净清爽，体态匀称，肩颈放松。',
  },
  {
    id: 'v57-role-model-white-male',
    name: '欧美白人男性',
    content: '一位25–35岁的欧美白人成年男性时装模特，深金色微卷短发，自然浅肤色，少量整齐的短胡茬，体态匀称，肩颈放松。',
  },
  {
    id: 'v57-role-model-latino-male',
    name: '拉美裔男性',
    content: '一位25–35岁的拉美裔成年男性时装模特，深棕色中短发，自然橄榄肤色，棕色眼睛，面部清爽，体态匀称，肩颈放松。',
  },
  {
    id: 'v57-role-model-black-male',
    name: '黑人男性',
    content: '一位25–35岁的黑人成年男性时装模特，利落的短卷发，深棕肤色并保留真实肤色层次，面部清爽，体态匀称，肩颈放松。',
  },
].map(entry => ({ ...entry, category: 'all', content: entry.content + presentation }));
