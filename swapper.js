// plugins/custom-ui/src/swapper.js

import { mediaConfig } from './main.js';

let mySummonerId = "";

// WebM/PNGタグを生成するヘルパー関数
function createMediaNode(url, baseClass) {
    if (!url) return null;
    const isVideo = url.includes('.webm');
    const node = document.createElement(isVideo ? 'video' : 'img');
    node.src = url;
    node.classList.add(baseClass, 'crayon-injected-media');
    
    if (isVideo) {
        node.autoplay = true;
        node.loop = true;
        node.muted = true;
        node.setAttribute('disablePictureInPicture', '');
    }
    return node;
}

// RiotのUI(Ember)によるスタイルの強制リセットに負けない非表示化ヘルパー
function hideOriginal(element) {
    if (element && element.style.opacity !== '0') {
        element.style.setProperty('opacity', '0', 'important');
        element.style.setProperty('visibility', 'hidden', 'important');
    }
}

// 新しい判定ヘルパー: 対象の要素が「自分」「パーティメンバー」「関係ない他人」のどれに属するかを判別する
function getTargetInfo(element) {
    if (!mySummonerId) return { type: 'mine' };

    let curr = element;
    let sid = null;
    let isModal = false;

    while (curr) {
        if (curr.tagName && curr.tagName.toLowerCase() === 'lol-uikit-full-page-modal') {
            isModal = true;
        }
        if (!sid && curr.getAttribute && curr.getAttribute('summoner-id')) {
            sid = curr.getAttribute('summoner-id').toString();
        }
        curr = curr.parentNode || (curr.getRootNode ? curr.getRootNode().host : null);
    }

    // IDが見つからない(ホーム画面など)、または自分のIDと完全に一致する場合
    if (!sid || sid === mySummonerId.toString()) {
        // モーダル(他人のプロフィール詳細画面)への漏れは絶対に防ぐ
        if (isModal) return null; 
        return { type: 'mine' };
    }

    // パーティメンバーのIDと一致した場合、そのメンバーの画像とレイアウトデータを返す
    if (mediaConfig.partyMembers && mediaConfig.partyMembers[sid]) {
        return { type: 'party', sid: sid, data: mediaConfig.partyMembers[sid] };
    }

    return null; // 関係ない他人は弾く
}

// 動的CSS変数（レイアウト設定）を要素に適用するヘルパー
function applyLayoutVariables(element, layoutData) {
    if (!element || !layoutData) return;
    
    // アイコン枠の調整値
    if (layoutData.iconX !== undefined) element.style.setProperty('--profile-icon-x', `${layoutData.iconX}px`);
    if (layoutData.iconY !== undefined) element.style.setProperty('--profile-icon-y', `${layoutData.iconY}px`);
    if (layoutData.iconW !== undefined) element.style.setProperty('--profile-icon-w', `${layoutData.iconW}%`);
    if (layoutData.iconH !== undefined) element.style.setProperty('--profile-icon-h', `${layoutData.iconH}%`);
    
    // アイコン画像の中身の調整値
    if (layoutData.imgX !== undefined) element.style.setProperty('--profile-img-x', `${layoutData.imgX}px`);
    if (layoutData.imgY !== undefined) element.style.setProperty('--profile-img-y', `${layoutData.imgY}px`);
    if (layoutData.imgS !== undefined) element.style.setProperty('--profile-icon-s', layoutData.imgS);
}

export async function initSwapper() {
    try {
        const res = await fetch('/lol-summoner/v1/current-summoner');
        const data = await res.json();
        if (data && data.summonerId) {
            mySummonerId = data.summonerId.toString();
        }
    } catch (e) {}

    // グローバル背景(bg)の動的挿入
    if (!document.querySelector('.crayon-global-bg-container')) {
        const bgContainer = document.createElement('div');
        bgContainer.className = 'crayon-global-bg-container';
        const bestBg = mediaConfig.bg?.length ? (mediaConfig.bg.find(f => f.includes('.webm')) || mediaConfig.bg[0]) : null;
        if (bestBg) {
            const media = createMediaNode(bestBg, 'crayon-global-bg');
            bgContainer.appendChild(media);
        }
        document.body.prepend(bgContainer);
    }
}

export function runSwapperOnRoot(root) {
    
    // 1. バナーの差し替え (パーティ共有対応)
    const banners = root.querySelectorAll('img.regalia-banner-asset-static-image');
    banners.forEach(img => {
        if (img.src && img.src.includes('BannerSkins')) {
            const info = getTargetInfo(img);
            if (!info) return;

            let bestBanner = null;
            if (info.type === 'mine') {
                bestBanner = mediaConfig.banner?.length ? (mediaConfig.banner.find(f => f.includes('.webm')) || mediaConfig.banner[0]) : null;
            } else if (info.type === 'party') {
                bestBanner = info.data.banner;
            }

            if (bestBanner) {
                const parent = img.parentElement;
                if (parent) {
                    let existing = parent.querySelector('.crayon-custom-banner');
                    let isVideo = bestBanner.includes('.webm');
                    if (existing && existing.tagName.toLowerCase() !== (isVideo ? 'video' : 'img')) {
                        existing.remove();
                        existing = null;
                    }
                    if (!existing) {
                        const media = createMediaNode(bestBanner, 'crayon-custom-banner');
                        media.classList.add('regalia-banner-asset-static-image');
                        media.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0;';
                        parent.appendChild(media);
                    } else if (existing.getAttribute('src') !== bestBanner) {
                        existing.setAttribute('src', bestBanner);
                    }
                }
                hideOriginal(img);
            }
        }
    });
    
    // 2. エンブレムの差し替え (パーティ共有対応・フォールバック追加)
    const emblems = root.querySelectorAll('lol-regalia-emblem-element');
    emblems.forEach(emblem => {
        const info = getTargetInfo(emblem);
        if (!info) return;

        const tierAttr = emblem.getAttribute('ranked-tier');
        if (tierAttr) {
            let tierName = tierAttr.trim().toLowerCase();
            if (tierName === 'none' || tierName === '') tierName = 'unranked';
            
            let bestEmblem = null;
            if (info.type === 'mine') {
                bestEmblem = mediaConfig.emblem?.length ? (mediaConfig.emblem.find(f => f.includes(`${tierName}.webm`)) || mediaConfig.emblem.find(f => f.includes(tierName)) || mediaConfig.emblem[0]) : null;
            } else if (info.type === 'party') {
                bestEmblem = info.data.emblem;
            }
            
            const parent = emblem.parentElement;
            if (parent && parent.classList.contains('style-profile-ranked-crest-ranked')) {
                if (bestEmblem) {
                    let existing = parent.querySelector('.crayon-custom-emblem');
                    let isVideo = bestEmblem.includes('.webm');
                    if (existing && existing.tagName.toLowerCase() !== (isVideo ? 'video' : 'img')) {
                        existing.remove();
                        existing = null;
                    }
                    if (!existing) {
                        const media = createMediaNode(bestEmblem, 'crayon-custom-emblem');
                        media.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; pointer-events: none; z-index: 1;';
                        parent.appendChild(media);
                    } else if (existing.getAttribute('src') !== bestEmblem) {
                        existing.setAttribute('src', bestEmblem);
                    }
                    hideOriginal(emblem);
                    parent.style.setProperty('background-image', 'none', 'important');
                }
            }
        }
        if (!emblem.classList.contains('custom-emblem-applied')) emblem.classList.add('custom-emblem-applied');
    });

    // 3. 名誉アイコンの差し替え (パーティ共有対応)
    const honorIcons = root.querySelectorAll('img.style-profile-honor-icon-v3');
    honorIcons.forEach(icon => {
        if (icon.src && icon.src.includes('honor/profile')) {
            const info = getTargetInfo(icon);
            if (!info) return;

            let bestHonor = null;
            if (info.type === 'mine') {
                bestHonor = mediaConfig.honor?.length ? (mediaConfig.honor.find(f => f.includes('.webm')) || mediaConfig.honor[0]) : null;
            } else if (info.type === 'party') {
                bestHonor = info.data.honor;
            }

            if (bestHonor) {
                const parent = icon.parentElement;
                if (parent) {
                    let existing = parent.querySelector('.crayon-custom-honor');
                    let isVideo = bestHonor.includes('.webm');
                    if (existing && existing.tagName.toLowerCase() !== (isVideo ? 'video' : 'img')) {
                        existing.remove();
                        existing = null;
                    }
                    if (!existing) {
                        const media = createMediaNode(bestHonor, 'crayon-custom-honor');
                        media.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; transform: scale(1.2);';
                        parent.appendChild(media);
                    } else if (existing.getAttribute('src') !== bestHonor) {
                        existing.setAttribute('src', bestHonor);
                    }
                }
                hideOriginal(icon);
            }
        }
    });

    // 4. レベルリング（外枠）の動的挿入 (パーティ共有対象外：個人のレベルに依存するため)
    const levelRings = root.querySelectorAll('lol-uikit-themed-level-ring-v2');
    levelRings.forEach(ring => {
        const info = getTargetInfo(ring);
        if (!info || info.type !== 'mine') return;

        if (!ring.classList.contains('custom-border-applied')) ring.classList.add('custom-border-applied');
        const bestBorder = mediaConfig.border?.length ? (mediaConfig.border.find(f => f.includes('.webm')) || mediaConfig.border[0]) : null;
        if (bestBorder && ring.shadowRoot) {
            let existing = ring.shadowRoot.querySelector('.crayon-custom-ring');
            let isVideo = bestBorder.includes('.webm');
            if (existing && existing.tagName.toLowerCase() !== (isVideo ? 'video' : 'img')) {
                existing.remove();
                existing = null;
            }
            if (!existing) {
                const media = createMediaNode(bestBorder, 'crayon-custom-ring');
                media.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; pointer-events: none;';
                ring.shadowRoot.appendChild(media);
                
                const ringStyle = new CSSStyleSheet();
                ringStyle.replaceSync(`div, img, svg { opacity: 0 !important; visibility: hidden !important; } .crayon-custom-ring { opacity: 1 !important; visibility: visible !important; }`);
                if (!ring.shadowRoot.adoptedStyleSheets.includes(ringStyle)) {
                    ring.shadowRoot.adoptedStyleSheets = [...ring.shadowRoot.adoptedStyleSheets, ringStyle];
                }
            } else if (existing.getAttribute('src') !== bestBorder) {
                existing.setAttribute('src', bestBorder);
            }
        }
    });

    // 5. ホーム背景(Front)とモード背景(Mode)の動的挿入 (パーティ共有対象外)
    const frontContainer = root.querySelector('.activity-center__background-component_container');
    if (frontContainer) {
        const bestFront = mediaConfig.front?.length ? (mediaConfig.front.find(f => f.includes('.webm')) || mediaConfig.front[0]) : null;
        if (bestFront) {
            let existing = frontContainer.querySelector('.crayon-custom-front');
            let isVideo = bestFront.includes('.webm');
            if (existing && existing.tagName.toLowerCase() !== (isVideo ? 'video' : 'img')) {
                existing.remove();
                existing = null;
            }
            if (!existing) {
                const media = createMediaNode(bestFront, 'crayon-custom-front');
                media.style.cssText = 'position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important; object-fit: cover !important; z-index: 0 !important; pointer-events: none !important;';
                frontContainer.appendChild(media);
            } else if (existing.getAttribute('src') !== bestFront) {
                existing.setAttribute('src', bestFront);
            }
            
            const origParent = frontContainer.parentElement;
            if (origParent) {
                const origFronts = origParent.querySelectorAll('.activity-center__background-component__image, .activity-center__background-component__blend');
                origFronts.forEach(el => hideOriginal(el));
            }
        }
    }

    const modeContainer = root.querySelector('.parties-background');
    if (modeContainer) {
        const bestMode = mediaConfig.mode?.length ? (mediaConfig.mode.find(f => f.includes('.webm')) || mediaConfig.mode[0]) : null;
        if (bestMode) {
            let existing = modeContainer.querySelector('.crayon-custom-mode');
            let isVideo = bestMode.includes('.webm');
            if (existing && existing.tagName.toLowerCase() !== (isVideo ? 'video' : 'img')) {
                existing.remove();
                existing = null;
            }
            if (!existing) {
                const media = createMediaNode(bestMode, 'crayon-custom-mode');
                media.style.cssText = 'position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important; object-fit: cover !important; z-index: -1 !important; pointer-events: none !important;';
                modeContainer.appendChild(media);
            } else if (existing.getAttribute('src') !== bestMode) {
                existing.setAttribute('src', bestMode);
            }
            
            const origImgs = modeContainer.querySelectorAll('img:not(.crayon-injected-media), video:not(.crayon-injected-media)');
            origImgs.forEach(img => hideOriginal(img));
        }
    }

    // 6. プロフィール背景(Profile)の動的挿入 (パーティ共有対応)
    const profileContainer = root.querySelector('.style-profile-backdrop-container');
    if (profileContainer) {
        const info = getTargetInfo(profileContainer);
        if (info) {
            let bestProfile = null;
            if (info.type === 'mine') {
                bestProfile = mediaConfig.profile?.length ? (mediaConfig.profile.find(f => f.includes('.webm')) || mediaConfig.profile[0]) : null;
            } else if (info.type === 'party') {
                bestProfile = info.data.profile;
            }

            if (bestProfile) {
                let existing = profileContainer.querySelector('.crayon-custom-profile');
                let isVideo = bestProfile.includes('.webm');
                if (existing && existing.tagName.toLowerCase() !== (isVideo ? 'video' : 'img')) {
                    existing.remove();
                    existing = null;
                }
                if (!existing) {
                    const media = createMediaNode(bestProfile, 'crayon-custom-profile');
                    media.style.cssText = 'position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important; object-fit: cover !important; z-index: 0 !important; pointer-events: none !important;';
                    profileContainer.prepend(media);
                } else if (existing.getAttribute('src') !== bestProfile) {
                    existing.setAttribute('src', bestProfile);
                }
                
                const origBgs = profileContainer.querySelectorAll('.style-profile-masked-image, lol-uikit-background-switcher, .style-profile-backdrop-component');
                origBgs.forEach(el => hideOriginal(el));
            }
        }
    }

    // 7. プロフィールアイコン＆クレスト枠の差し替え (パーティ共有・レイアウト同期対応)
    const injectToCrest = (crest, info) => {
        if (!crest.classList.contains('custom-icon-applied')) crest.classList.add('custom-icon-applied');
        
        if (crest.shadowRoot) {
            const maskContainer = crest.shadowRoot.querySelector('.lol-regalia-summoner-icon-mask-container');
            
            let bestIcon = null;
            if (info.type === 'mine') {
                bestIcon = mediaConfig.icon?.length ? (mediaConfig.icon.find(f => f.includes('.webm')) || mediaConfig.icon[0]) : null;
            } else if (info.type === 'party') {
                bestIcon = info.data.icon;
                applyLayoutVariables(maskContainer, info.data.layout); // お友達のレイアウト設定を適用
            }

            if (maskContainer && bestIcon) {
                let existing = maskContainer.querySelector('.crayon-custom-icon');
                let isVideo = bestIcon.includes('.webm');
                if (existing && existing.tagName.toLowerCase() !== (isVideo ? 'video' : 'img')) {
                    existing.remove();
                    existing = null;
                }
                if (!existing) {
                    const iconNode = createMediaNode(bestIcon, 'crayon-custom-icon');
                    iconNode.style.cssText = `
                        position: absolute !important; top: 0 !important; left: 0 !important;
                        width: 100% !important; height: 100% !important; object-fit: cover !important;
                        transform: translate(var(--profile-img-x, 0px), var(--profile-img-y, 0px)) scale(var(--profile-icon-s, 1)) !important;
                    `;
                    maskContainer.appendChild(iconNode);
                } else if (existing.getAttribute('src') !== bestIcon) {
                    existing.setAttribute('src', bestIcon);
                }
                const origIcon = maskContainer.querySelector('.lol-regalia-summoner-icon');
                hideOriginal(origIcon); 
            }
            
            // ボーダー枠 (パーティ共有対応)
            let bestBorder = null;
            if (info.type === 'mine') {
                bestBorder = mediaConfig.border?.length ? (mediaConfig.border.find(f => f.includes('.webm')) || mediaConfig.border[0]) : null;
            } else if (info.type === 'party') {
                bestBorder = info.data.border;
            }

            if (bestBorder) {
                let existing = crest.shadowRoot.querySelector('.crayon-custom-border');
                let isVideo = bestBorder.includes('.webm');
                if (existing && existing.tagName.toLowerCase() !== (isVideo ? 'video' : 'img')) {
                    existing.remove();
                    existing = null;
                }
                if (!existing) {
                    const borderNode = createMediaNode(bestBorder, 'crayon-custom-border');
                    borderNode.classList.add('custom-border-applied');
                    borderNode.style.cssText = `
                        position: absolute !important; top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
                        width: 100% !important; height: 100% !important;
                        object-fit: contain !important; pointer-events: none !important; z-index: 0 !important;
                        transition: filter 0.2s ease !important;
                    `;
                    crest.shadowRoot.appendChild(borderNode);
                } else if (existing.getAttribute('src') !== bestBorder) {
                    existing.setAttribute('src', bestBorder);
                }
            }

            const iconStyle = new CSSStyleSheet();
            iconStyle.replaceSync(`
                .lol-regalia-summoner-icon-mask-container {
                    position: absolute !important; top: 50% !important; left: 50% !important;
                    width: var(--profile-icon-w, 100%) !important; height: var(--profile-icon-h, 100%) !important;
                    transform: translate(calc(-50% + var(--profile-icon-x, 0px)), calc(-50% + var(--profile-icon-y, 0px))) !important;
                    box-shadow: var(--hl-profile-box, none) !important; border-radius: 50%;
                }
                .lol-regalia-crest-image, .lol-regalia-prestige-crest-image,
                img.lol-regalia-crest-image, img.lol-regalia-prestige-crest-image { opacity: 0 !important; visibility: hidden !important; }
            `);
            if (!crest.shadowRoot.adoptedStyleSheets.includes(iconStyle)) {
                crest.shadowRoot.adoptedStyleSheets = [...crest.shadowRoot.adoptedStyleSheets, iconStyle];
            }
        }
    };

    const crests = root.querySelectorAll('lol-regalia-crest-v2-element');
    crests.forEach(crest => {
        const info = getTargetInfo(crest);
        if (info) injectToCrest(crest, info);
    });
}