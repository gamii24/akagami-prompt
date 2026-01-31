-- Sample prompts with images
-- Prompt 1: ビジネス
INSERT INTO prompts (title, prompt_text, image_url, category_id) VALUES (
  'プロフェッショナルなビジネスポートレート',
  'Professional business portrait, confident expression, modern office background, natural lighting, high quality, corporate headshot style',
  'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=800&h=800&fit=crop',
  1
);

INSERT INTO prompt_images (prompt_id, image_url, display_order) VALUES 
(1, 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&h=750&fit=crop', 0),
(1, 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=600&h=750&fit=crop', 1),
(1, 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=600&h=750&fit=crop', 2),
(1, 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=600&h=750&fit=crop', 3),
(1, 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=600&h=750&fit=crop', 4);

-- Prompt 2: アイコン写真
INSERT INTO prompts (title, prompt_text, image_url, category_id) VALUES (
  'かわいいアニメスタイルのアバター',
  'Cute anime style avatar, kawaii character, pastel colors, soft lighting, chibi style, friendly smile, digital art',
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=800&h=800&fit=crop',
  2
);

INSERT INTO prompt_images (prompt_id, image_url, display_order) VALUES 
(2, 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=600&h=750&fit=crop', 0),
(2, 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=600&h=750&fit=crop', 1),
(2, 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&h=750&fit=crop', 2),
(2, 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&h=750&fit=crop', 3),
(2, 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=600&h=750&fit=crop', 4);

-- Prompt 3: ネタ
INSERT INTO prompts (title, prompt_text, image_url, category_id) VALUES (
  '面白い猫ミームジェネレーター',
  'Funny cat meme, humorous expression, viral meme style, internet culture, relatable situation, comedy gold',
  'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=800&h=800&fit=crop',
  3
);

INSERT INTO prompt_images (prompt_id, image_url, display_order) VALUES 
(3, 'https://images.unsplash.com/photo-1574158622682-e40e69881006?w=600&h=750&fit=crop', 0),
(3, 'https://images.unsplash.com/photo-1529778873920-4da4926a72c2?w=600&h=750&fit=crop', 1),
(3, 'https://images.unsplash.com/photo-1573865526739-10c1de0e3ac5?w=600&h=750&fit=crop', 2),
(3, 'https://images.unsplash.com/photo-1495360010541-f48722b34f7d?w=600&h=750&fit=crop', 3),
(3, 'https://images.unsplash.com/photo-1543852786-1cf6624b9987?w=600&h=750&fit=crop', 4);

-- Prompt 4: ビジネス
INSERT INTO prompts (title, prompt_text, image_url, category_id) VALUES (
  'モダンなプレゼンテーション資料',
  'Modern presentation slide design, professional layout, infographics, clean typography, corporate color scheme, business visual',
  'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=800&h=800&fit=crop',
  1
);

INSERT INTO prompt_images (prompt_id, image_url, display_order) VALUES 
(4, 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=600&h=750&fit=crop', 0),
(4, 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&h=750&fit=crop', 1),
(4, 'https://images.unsplash.com/photo-1553877522-43269d4ea984?w=600&h=750&fit=crop', 2),
(4, 'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=600&h=750&fit=crop', 3),
(4, 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&h=750&fit=crop', 4);

-- Prompt 5: その他
INSERT INTO prompts (title, prompt_text, image_url, category_id) VALUES (
  '幻想的な風景イラスト',
  'Fantasy landscape illustration, magical scenery, dreamy atmosphere, vibrant colors, epic scale, digital painting style',
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=800&fit=crop',
  4
);

INSERT INTO prompt_images (prompt_id, image_url, display_order) VALUES 
(5, 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&h=750&fit=crop', 0),
(5, 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=600&h=750&fit=crop', 1),
(5, 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=600&h=750&fit=crop', 2),
(5, 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=600&h=750&fit=crop', 3),
(5, 'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=600&h=750&fit=crop', 4);
