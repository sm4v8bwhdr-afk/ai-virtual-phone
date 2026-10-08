"use client";

import { useEffect } from "react";
import { ensureBianaoCharacter } from "@/lib/demo-character";

/**
 * 演示模式启动器：应用加载时自动确保默认角色「必爱诺」存在，
 * 用户无需手动创建，开箱即用。
 */
export function DemoBootstrap() {
    useEffect(() => {
        try {
            ensureBianaoCharacter();
        } catch {
            /* 忽略初始化错误 */
        }
    }, []);
    return null;
}
