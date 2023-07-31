import { NgModule } from '@angular/core';
import { MatDialogModule} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule} from '@angular/material/select';
import { MatListModule} from '@angular/material/list';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';


@NgModule({
    declarations: [],
    imports: [
        MatDialogModule,
        MatFormFieldModule,
        MatButtonModule,
        MatInputModule,
        MatIconModule,
        MatCheckboxModule,
        DragDropModule,
        MatMenuModule,
        MatSelectModule,
        MatListModule,
        MatTooltipModule,
        MatProgressBarModule
    ],
    exports: [
        MatDialogModule,
        MatFormFieldModule,
        MatButtonModule,
        MatInputModule,
        MatIconModule,
        MatCheckboxModule,
        DragDropModule,
        MatMenuModule,
        MatSelectModule,
        MatListModule,
        MatTooltipModule,
        MatProgressBarModule
    ]
})
export class AngularMaterialModule {
}
