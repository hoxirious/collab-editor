import { Context } from "koa";
import Changeset from "../../../common/model/Changeset";
import { invertOperations } from "../../../common/transform/invert";
import { getChangesetOperations } from "../../../common/utils";
import ChangesetEntity from "../entity/ChangesetEntity";
import CodeEntity from "../entity/CodeEntity";
import UserEntity from "../entity/UserEntity";
import ChangesetService from "../service/ChangesetService";
import SnapshotService from "../service/SnapshotService";
import CodeController from "./CodeController";


interface HistoryBody {
    version: string,
    memberId: string
    changesets: Changeset[]
    baseVersion: number
}
export default class HistoryController {
    static async get(ctx: Context) {
        const codeId = ctx.params.codeId;
        if (!codeId) {
            ctx.status = 400;
            return;
        }

        const userMap: { [userId: number]: {} } = {};
        const changesets = await ChangesetEntity.find({
            where: { codeId },
            order: { baseVersion: 'DESC' },
            take: 1000,
        });
        const list: {}[] = [];
        for (let i = 0; i < changesets.length; i++) {
            const userId = changesets[i].userId;
            const user = userMap[userId] || await UserEntity.findOneBy({ id: userId }) || {};
            userMap[userId] = user;
            list.push({
                ...changesets[i],
                operations: changesets[i].getOperations(),
                user,
            });
        }

        ctx.body = list;
    }

    static async preview(ctx: Context) {
        const codeId = ctx.params.codeId;
        const version = Number(ctx.query.version);
        if (!codeId || !(version >= 0)) {
            ctx.status = 400;
            return;
        }

        const snapshot = await SnapshotService.get(codeId, version);
        ctx.body = snapshot;
    }


    static async revert(ctx: Context) {
        const codeId = ctx.params.codeId;
        const version = Number((<HistoryBody>ctx.request.body).version);
        const memberId = Number((<HistoryBody>ctx.request.body).memberId);
        const userId = Number(ctx.cookies.get('user_id') || ctx.query.userId);
        if (!codeId || !(version >= 0) || !userId || !memberId) {
            ctx.status = 400;
            return;
        }

        const code = await CodeEntity.findOneBy({ codeId });
        if (!code || version >= code.version) {
            ctx.status = 400;
            return;
        }

        const changesets = await ChangesetService.getByRange(codeId, version, code.version);
        const operations = invertOperations(getChangesetOperations(changesets));

        (<HistoryBody>ctx.request.body).changesets = [new Changeset(
            operations,
            userId,
            memberId,
            code.version,
        )];
        (<HistoryBody>ctx.request.body).baseVersion = code.version;
        await CodeController.uploadChangeset(ctx);
    }
}
